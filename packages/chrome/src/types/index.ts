import React, { CSSProperties, ReactNode } from 'react';

export interface StyleExtendable {
  className?: string;
  style?: CSSProperties;
}

export type Extendable<T = ReactNode> = StyleExtendable & {
  children?: T;
};

export type OmitToken<T> = Omit<T, 'token'>;

export type StateTuple<T> = [T, React.Dispatch<React.SetStateAction<T>>];
