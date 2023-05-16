import React from 'react';
import classnames from 'classnames';
import styles from './index.module.scss';
import Typo from '../../components/Typo';
import { Extendable } from '../../types';
import ReactSkeleton from 'react-loading-skeleton';
import Img from '../../components/Img';

export type DappMediaItemProps = Extendable & {
  name: string;
  icon: string;
  desc: string;
  link: string;
};

const DappMediaItem = (props: DappMediaItemProps) => {
  return (
    <a
      href={props.link}
      target={'_blank'}
      className={classnames(styles['dapp-media-item'], props.className)}
      rel="noreferrer"
    >
      <div className={styles['dapp-media-item__img-wrap']}>
        <Img
          src={props.icon}
          alt="icon"
          className={styles['dapp-media-item__img']}
        />
      </div>
      <div className={'ml-[24px] w-[220px]'}>
        <Typo.Title className={styles['dapp-media-item__name']}>
          {props.name}
        </Typo.Title>
        <Typo.Normal className={styles['dapp-media-item__desc']}>
          {props.desc}
        </Typo.Normal>
      </div>
    </a>
  );
};

export const Skeleton = (props: Extendable) => {
  return (
    <div className={classnames(styles['dapp-media-item'], props.className)}>
      <ReactSkeleton className={styles['dapp-media-item__img-wrap']} />
      <div className={'ml-[24px] w-[220px]'}>
        <ReactSkeleton height={'12px'} />
        <ReactSkeleton height={'12px'} />
      </div>
    </div>
  );
};

export default DappMediaItem;
