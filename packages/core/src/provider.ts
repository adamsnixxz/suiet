import {
  getObjectExistsResponse,
  JsonRpcProvider,
  RpcTxnDataSerializer,
  SuiMoveObject,
  SuiObject,
  getTransferObjectTransaction,
  getTransferSuiTransaction,
  getTransactionData,
  getExecutionStatusType,
  getMoveObject,
} from '@mysten/sui.js';
import { TxnHistroyEntry } from './storage/types';
import { SignedTx } from './vault/types';
import { Vault } from './vault/Vault';
import { Network } from './api/network';

export const SUI_SYSTEM_STATE_OBJECT_ID =
  '0x0000000000000000000000000000000000000005';

export class Provider {
  provider: JsonRpcProvider;

  constructor(network: Network) {
    this.provider = new JsonRpcProvider(network.rpcURL);
  }

  public async getActiveValidators(): Promise<SuiMoveObject[]> {
    const contents = await this.provider.getObject(SUI_SYSTEM_STATE_OBJECT_ID);
    const data = (contents.details as SuiObject).data;
    const validators = (data as SuiMoveObject).fields.validators;
    const activeValidators = (validators as SuiMoveObject).fields
      .active_validators;
    return activeValidators as SuiMoveObject[];
  }

  async getOwnedObjects(address: string): Promise<SuiObject[]> {
    const objectInfos = await this.provider.getObjectsOwnedByAddress(address);
    const objectIds = objectInfos.map((obj) => obj.objectId);
    const resps = await this.provider.getObjectBatch(objectIds);
    return resps
      .filter((resp) => resp.status === 'Exists')
      .map((resp) => getObjectExistsResponse(resp) as SuiObject);
  }

  public async getOwnedCoins(address: string): Promise<CoinObject[]> {
    const objects = await this.getOwnedObjects(address);
    const res = objects
      .map((item) => getMoveObject(item))
      .filter((item) => item && Coin.isCoin(item))
      .map((item) => {
        const obj = item as SuiMoveObject;
        const arg = Coin.getCoinTypeArg(obj);
        const symbol = arg ? Coin.getCoinSymbol(arg) : '';
        const balance = Coin.getBalance(obj);
        const id = Coin.getID(obj);
        return {
          objectId: id,
          symbol,
          balance,
        };
      });
    return res;
  }

  public async getTransactionsForAddress(
    address: string
  ): Promise<TxnHistroyEntry[]> {
    const txs = await this.provider.getTransactionsForAddress(address);
    const digests = txs
      .map((tx) => tx[1])
      .filter((value, index, self) => self.indexOf(value) === index);
    const effects = await this.provider.getTransactionWithEffectsBatch(digests);
    const results = [];
    for (const effect of effects) {
      const data = getTransactionData(effect.certificate);
      for (const tx of data.transactions) {
        const transferSui = getTransferSuiTransaction(tx);
        if (transferSui) {
          results.push({
            timestamp_ms: effect.timestamp_ms,
            txStatus: getExecutionStatusType(effect),
            from: data.sender,
            to: transferSui.recipient,
            object: {
              type: 'coin' as 'coin',
              balance: transferSui.amount
                ? BigInt(transferSui.amount)
                : BigInt(0),
              symbol: 'SUI',
            },
          });
        } else {
          const transferObject = getTransferObjectTransaction(tx);
          if (transferObject) {
            const resp = await this.provider.getObject(
              transferObject.objectRef.objectId
            );
            const obj = getMoveObject(resp);
            if (obj && Coin.isCoin(obj)) {
              const balance = Coin.getBalance(obj);
              const arg = Coin.getCoinTypeArg(obj);
              const symbol = arg ? Coin.getCoinSymbol(arg) : '';
              // TODO: for now provider does not support to get histrorical object data,
              // so the record here may not be accurate.
              results.push({
                timestamp_ms: effect.timestamp_ms,
                txStatus: getExecutionStatusType(effect),
                from: data.sender,
                to: transferObject.recipient,
                object: {
                  type: 'coin' as 'coin',
                  balance,
                  symbol,
                },
              });
            }
            // TODO: handle more object types
          }
        }
      }
    }
    return results;
  }
}

class Coin {
  public static isCoin(obj: SuiMoveObject) {
    return obj.type.startsWith(COIN_TYPE);
  }

  public static getCoinTypeArg(obj: SuiMoveObject) {
    const res = obj.type.match(COIN_TYPE_ARG_REGEX);
    return res ? res[1] : null;
  }

  public static isSUI(obj: SuiMoveObject) {
    const arg = Coin.getCoinTypeArg(obj);
    return arg ? Coin.getCoinSymbol(arg) === 'SUI' : false;
  }

  public static getCoinSymbol(coinTypeArg: string) {
    return coinTypeArg.substring(coinTypeArg.lastIndexOf(':') + 1);
  }

  public static getBalance(obj: SuiMoveObject): bigint {
    return BigInt(obj.fields.balance);
  }

  public static getID(obj: SuiMoveObject): string {
    return obj.fields.id.id;
  }

  public static getCoinTypeFromArg(coinTypeArg: string) {
    return `${COIN_TYPE}<${coinTypeArg}>`;
  }
}

export type CoinObject = {
  objectId: string;
  symbol: string;
  balance: bigint;
};

const COIN_TYPE = '0x2::coin::Coin';
const COIN_TYPE_ARG_REGEX = /^0x2::coin::Coin<(.+)>$/;
export const DEFAULT_GAS_BUDGET_FOR_SPLIT = 1000;
export const DEFAULT_GAS_BUDGET_FOR_MERGE = 500;
export const DEFAULT_GAS_BUDGET_FOR_TRANSFER = 100;
export const DEFAULT_GAS_BUDGET_FOR_TRANSFER_SUI = 100;
export const DEFAULT_GAS_BUDGET_FOR_STAKE = 1000;
export const GAS_TYPE_ARG = '0x2::sui::SUI';
export const GAS_SYMBOL = 'SUI';
export const DEFAULT_NFT_TRANSFER_GAS_FEE = 450;

type MergeCoins = {
  primary: string;
  mergeCoins: string[];
  estimatedBalance: bigint;
};

export class CoinProvider {
  provider: JsonRpcProvider;
  serializer: RpcTxnDataSerializer;
  vault: Vault;

  constructor(endpoint: string, vault: Vault) {
    this.provider = new JsonRpcProvider(endpoint);
    this.serializer = new RpcTxnDataSerializer(endpoint);
    this.vault = vault;
  }

  async mergeCoinsForBalance(
    coins: CoinObject[],
    amount: bigint
  ): Promise<MergeCoins | CoinObject> {
    coins.sort((a, b) => (a.balance - b.balance > 0 ? 1 : -1));
    const coinWithSufficientBalance = coins.find(
      (coin) => coin.balance >= amount
    );
    if (coinWithSufficientBalance) {
      return coinWithSufficientBalance;
    }
    // merge coins with sufficient balance.
    const primaryCoin = coins[coins.length - 1];
    let estimatedBalance = primaryCoin.balance;
    const coinsToMerge = [];
    for (let i = coins.length - 2; i > 0; i--) {
      estimatedBalance += coins[i].balance;
      coinsToMerge.push(coins[i].objectId);
      if (estimatedBalance >= amount) {
        return {
          primary: primaryCoin.objectId,
          mergeCoins: coinsToMerge,
          estimatedBalance,
        };
      }
    }
    throw new Error('Insufficient balance');
  }

  async splitCoin(coin: CoinObject, amount: bigint) {}

  public async transferCoin() {}

  public async transferSui() {}

  public async executeTransaction(txn: SignedTx) {
    return await this.provider.executeTransaction(
      txn.data.toString(),
      txn.signature.toString('base64'),
      txn.pubKey.toString('base64')
    );
  }
}