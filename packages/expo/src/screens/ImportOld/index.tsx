import * as React from 'react';
import { StackScreenProps } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, ScrollView, KeyboardAvoidingView, Dimensions, Alert } from 'react-native';

import type { RootStackParamList } from '@/../App';
import { Gray_100, Gray_400 } from '@/styles/colors';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { useKeychain } from '@/hooks/useKeychain';
import { useWallets } from '@/hooks/useWallets';
import { TextInput } from '@/components/TextInput';
import Typography from '@/components/Typography';
import { LoadingDots } from '@/components/Loading';

export const ImportOld: React.FC<StackScreenProps<RootStackParamList, 'ImportOld'>> = ({ navigation }) => {
  const { width, height } = Dimensions.get('screen');
  const { top, bottom } = useSafeAreaInsets();

  const [buttonLoading, setButtonLoading] = useState<boolean>();
  const [textInputValue, setTextInputValue] = useState<string>();

  const { saveMnemonic } = useKeychain();
  const { wallets, updateWallets, selectedWallet, updateSelectedWallet } = useWallets();

  return (
    <View style={{ flexDirection: 'column', flexGrow: 1, backgroundColor: 'white' }}>
      <KeyboardAvoidingView style={{ flexGrow: 1 }} behavior={'height'}>
        <ScrollView style={{ paddingHorizontal: 24 }} overScrollMode="never">
          <View style={{ marginVertical: 24 }}>
            <Typography.Headline color="black" children="Input" />
            <Typography.Headline color="black" children="Recovery" />
            <Typography.Headline color="black" children="Phrase" />
            <View style={{ height: 8 }} />
            <Typography.Body color={Gray_400} children="From an existing wallet." />
          </View>

          <TextInput
            value={textInputValue}
            onChangeText={setTextInputValue}
            style={{
              minHeight: 96,
            }}
            placeholder="Input recovery phrase of old wallet"
          />

          <View style={{ height: 16 }} />

          <Typography.Body
            color={Gray_400}
            children="Recovery phrase was displayed when you first created your wallet."
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* <View style={{ flexGrow: 1 }}></View> */}

      <View style={{ height: 1, backgroundColor: Gray_100, width }} />
      <View style={{ padding: 12 }}>
        {buttonLoading ? (
          <View
            style={{
              height: 48,
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <LoadingDots />
          </View>
        ) : (
          <Button
            title="Confirm and Import"
            onPress={async () => {
              if (!textInputValue) {
                return;
              }

              setButtonLoading(true);

              try {
                // This timeout is to prevent the UI from freezing
                await new Promise((resolve) => setTimeout(resolve, 500));
                const { Vault } = await import('@suiet/core/src/vault/Vault');
                const { derivationHdPath } = await import('@suiet/core/src/crypto');

                const mnemonic = textInputValue;
                let address: string;
                try {
                
                  // check mnemonic words all in word list 

                  const { wordlist } = await import('@scure/bip39/wordlists/english');
                  const words = mnemonic.trim().split(/[\s\n]+/);
                  const invalidWords = words.filter((word) => !wordlist.includes(word));
                  if (invalidWords.length > 0) { 
                    Alert.alert('Invalid Words', `Words ${invalidWords} is invalid.`, [
                      {
                        text: 'OK',
                        onPress: () => {
                          // navigation.goBack();
                        },
                      },
                    ]);
                    return;
                  }

                  const vault = await Vault.fromMnemonic(derivationHdPath(0), words.join(' '));
                  address = vault.getAddress();
                } catch (e: any) {
                  Alert.alert('Validation Error', 'Your recovery phrase is invalid.', [
                    {
                      text: 'OK',
                      onPress: () => {
                        // navigation.goBack();
                      },
                    },
                  ]);
                  return;
                }

                if (wallets.some((wallet) => wallet.address === address)) {
                  Alert.alert('Error', 'This wallet already exists.', [
                    {
                      text: 'OK',
                      onPress: () => {
                        // navigation.goBack();
                      },
                    },
                  ]);
                  return;
                }

                try {
                  await saveMnemonic(address, mnemonic);
                } catch (e: any) {
                  Alert.alert('Error', e.message, [
                    {
                      text: 'OK',
                      onPress: () => {
                        // navigation.goBack();
                      },
                    },
                  ]);
                  return;
                }

                updateWallets([
                  ...wallets,
                  {
                    name: `Wallet ${wallets.length + 1}`,
                    address,
                    avatar: wallets?.length % 9,
                  },
                ]);
                if (typeof selectedWallet === 'undefined') {
                  updateSelectedWallet(address);
                }

               
                navigation.popToTop();
                updateSelectedWallet(address);
                navigation.replace('Home');
              } finally {
                setButtonLoading(false);
              }
            }}
            disabled={!textInputValue}
          />
        )}
      </View>

      <View style={{ height: bottom - 8 }} />
    </View>
  );
};
