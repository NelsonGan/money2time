declare module '*.svg' {
  import type { SvgProps } from 'react-native-svg';
  import type React from 'react';

  const content: React.FC<SvgProps>;
  export default content;
}

declare module '*.db' {
  const asset: number;
  export default asset;
}
