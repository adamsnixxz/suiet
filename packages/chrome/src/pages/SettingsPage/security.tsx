import classnames from 'classnames';
import './common.scss';
import styles from './security.module.scss';
import Button from '../../components/Button';
import { Route, Routes, useNavigate } from 'react-router-dom';
import Modal from '../../components/Modal';
import { coreApi } from '@suiet/core';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../store';
import { useState } from 'react';
import SetPassword from '../OnBoarding/SetPassword';
import { updateWallet } from '../../store/wallet';
import copy from 'copy-to-clipboard';
import {
  updateAccountId,
  updateInitialized,
  updateToken,
  updateWalletId,
} from '../../store/app-context';

function MainPage() {
  const navigate = useNavigate();
  const { context } = useSelector((state: RootState) => ({
    context: state.appContext,
  }));
  const [phrase, setPhrase] = useState<string[]>([]);
  const [privateKey, setPrivate] = useState('');
  return (
    <div className={styles['security-setting-container']}>
      <div className="flex justify-end items-center h-14">
        <div
          className="setting-cancel"
          onClick={() => navigate('/settings')}
        ></div>
      </div>
      <div className="setting-title">Security</div>
      <div className="setting-desc">The security settings of your wallet</div>
      <div>
        <div className={styles['secutity-card']}>
          <div className={styles['security-title']}>Password</div>
          <div className={styles['security-desc']}>
            change your wallet login password
          </div>
          <Button
            onClick={() =>
              navigate('password', {
                state: {
                  hideApplayout: true,
                  hasOldPassword: true,
                },
              })
            }
            className="mb-8"
          >
            Update Password
          </Button>
        </div>
        <div className={styles['security-line']} />
        <div className={styles['secutity-card']}>
          <div className={styles['security-title']}>Recovery Phrases</div>
          <div
            className={classnames(styles['security-desc'], styles['warning'])}
          >
            A recovery phrase grants full access to all wallets generated by it.
            You can manage and export your recovery phrases.
          </div>
          <Modal
            title="Recovery Phrases"
            trigger={
              <Button className="mb-8" state={'danger'}>
                I understand, show my phrases
              </Button>
            }
            contentProps={{
              style: {
                width: 274,
              },
            }}
            onOpenChange={async () => {
              const rawPhrases = await coreApi.wallet.revealMnemonic(
                context.walletId,
                context.token
              );
              setPhrase(rawPhrases.split(' '));
            }}
          >
            <div className={styles['security-modal-content']}>
              <div className="flex flex-wrap">
                {phrase.slice(0, phrase.length).map((p, index) => (
                  <div
                    key={p}
                    className={classnames(
                      'flex items-center',
                      styles['phrase-container']
                    )}
                  >
                    <span className="inline-block text-gray-300 text-right select-none">{`${
                      index + 1 + 0
                    }`}</span>
                    <span className="ml-2">{`${p}`}</span>
                  </div>
                ))}
              </div>
              <div className={styles['security-modal-copy']}>
                <div onClick={() => copy(phrase.join(' '))}>Click to Copy</div>
              </div>
            </div>
          </Modal>
        </div>
        <div className={styles['security-line']} />
        <div className={styles['secutity-card']}>
          <div className={styles['security-title']}>Private Key</div>
          <div
            className={classnames(styles['security-desc'], styles['warning'])}
          >
            The private key grants full access to the current wallet. You can
            export the wallet by exporting its private key.
          </div>
          <Modal
            title="Private Key"
            trigger={
              <Button className="mb-8" state={'danger'}>
                I understand, show my private key
              </Button>
            }
            contentProps={{
              style: {
                width: 274,
              },
            }}
            onOpenChange={async () => {
              const privateKey = await coreApi.wallet.revealPrivate(
                context.walletId,
                context.token
              );
              setPrivate(privateKey);
            }}
          >
            <div className={styles['security-modal-content']}>
              {privateKey}
              <div className={styles['security-modal-copy']}>
                <div onClick={() => copy(privateKey)}>Click to Copy</div>
              </div>
            </div>
          </Modal>
        </div>
      </div>
    </div>
  );
}

function PasswordSetting() {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  async function createWalletAndAccount(token: string) {
    const wallet = await coreApi.wallet.createWallet({
      token,
    });

    const accounts = await coreApi.account.getAccounts(wallet.id);
    const defaultAccount = accounts[0];
    dispatch(
      updateWallet({
        avatar: wallet.avatar ?? '1',
        name: wallet.name,
      })
    );

    await dispatch(updateToken(token));
    await dispatch(updateWalletId(wallet.id));
    await dispatch(updateAccountId(defaultAccount.id));
    await dispatch(updateInitialized(true));
  }
  async function handleSetPassword(password: string, oldPassword?: string) {
    await coreApi.auth.updatePassword(oldPassword ?? '', password);
    const token = await coreApi.auth.loadTokenWithPassword(password);

    await createWalletAndAccount(token);
    navigate('..');
  }
  return <SetPassword onNext={handleSetPassword} />;
}

export default function Security() {
  return (
    <Routes>
      <Route path="/" element={<MainPage />} />
      <Route path="password" element={<PasswordSetting />} />
    </Routes>
  );
}
