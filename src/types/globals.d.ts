/// <reference types="nativewind/types" />

/** NativeWind's Metro transformer handles CSS imports; TS just needs a shape. */
declare module '*.css';

declare module '*.svg' {
  import type { FC } from 'react';
  import type { SvgProps } from 'react-native-svg';
  const content: FC<SvgProps>;
  export default content;
}

/** Set by React Native's bundler. */
declare const __DEV__: boolean;
