import classnames from 'classnames';
import styles from './security.module.scss';
import Button from '../../components/Button';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { UpdatePasswordParams } from '@suiet/core';
import SetPassword from '../onboarding/SetPassword';
import message from '../../components/message';
import { useApiClient } from '../../hooks/useApiClient';
import Nav from '../../components/Nav';
import { Extendable } from '../../types';
import SettingTwoLayout from '../../layouts/SettingTwoLayout';
import Typo from '../../components/Typo';
import PhraseModal from '../../components/secrets/PhraseModal';
import ForgetPassword from '../LockPage/ForgetPassword';
import BiometricSetting from '../../components/BiometricSetting';
import PrivateKeyModal from '../../components/secrets/PrivateKeyModal';
import classNames from 'classnames';

type SecurityItemProps = Extendable & {
  title: string;
  desc: string;
};

const SecurityItem = (props: SecurityItemProps) => {
  return (
    <div className={classnames(styles['secutity-card'], props.className)}>
      <Typo.Title className={styles['security-title']}>
        {props.title}
      </Typo.Title>
      <Typo.Normal className={classnames(styles['security-desc'])}>
        {props.desc}
      </Typo.Normal>

      {props.children}
    </div>
  );
};

function MainPage() {
  const navigate = useNavigate();
  return (
    <SettingTwoLayout
      title={'Security'}
      desc={'The security settings of your wallet'}
    >
      <Nav
        position={'absolute'}
        onNavBack={() => {
          navigate('/settings');
        }}
      />

      <section className={'mt-[36px]'}>
        <SecurityItem
          title={'Password'}
          desc={'change your wallet login password'}
        >
          <BiometricSetting />
          <Button
            onClick={() =>
              navigate('password', {
                state: {
                  hasOldPassword: true,
                },
              })
            }
            className="mb-8"
            solidBackground={true}
          >
            Update Password
          </Button>
        </SecurityItem>
        <SecurityItem
          title={'Recovery Phrases'}
          desc={
            'A recovery phrase grants full access to all wallets generated by it. You can manage and export your recovery phrases.'
          }
        >
          <PhraseModal
            trigger={<Button state={'danger'}>Show the Phrases</Button>}
          />
        </SecurityItem>

        <SecurityItem
          title={'Private Key'}
          desc={
            'The private key grants full access to the current wallet. You can export the wallet by exporting its private key.'
          }
        >
          <PrivateKeyModal
            trigger={
              <Button className="mb-8" state={'danger'}>
                Show the Private Key
              </Button>
            }
          />
        </SecurityItem>
      </section>
    </SettingTwoLayout>
  );
}

function PasswordSetting() {
  const apiClient = useApiClient();
  const navigate = useNavigate();

  async function handleSetPassword(password: string, oldPassword?: string) {
    try {
      await apiClient.callFunc<UpdatePasswordParams, undefined>(
        'auth.updatePassword',
        {
          oldPassword: oldPassword ?? '',
          newPassword: password,
        }
      );
    } catch (e: any) {
      if (e?.message.includes('Invalid password')) {
        message.error('The old password is incorrect');
      } else {
        message.error('Update password failed');
      }
      console.error(e);
      return;
    }

    message.success('Update password succeeded');
    navigate('..');
  }

  return (
    <div className={classNames(styles['page'], 'no-scrollbar')}>
      <Nav
        onNavBack={() => {
          navigate('..');
        }}
      />
      <SetPassword
        onNext={handleSetPassword}
        style={{
          paddingTop: 0,
        }}
      />
    </div>
  );
}

export default function Security() {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route path="/" element={<MainPage />} />
      <Route
        path="password"
        element={
          <div className={styles['page']}>
            <PasswordSetting />
          </div>
        }
      />
      <Route
        path="reset"
        element={
          <div className={classNames(styles['page'], 'no-scrollbar')}>
            <Nav
              title={'Reset Suiet'}
              onNavBack={() => {
                navigate('..');
              }}
            />
            <ForgetPassword
              titles={['Reset', 'Suiet']}
              desc={'Be careful! You may reset your app here.'}
            />
          </div>
        }
      />
    </Routes>
  );
}
