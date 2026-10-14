import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

interface LogoMarkProps {
  size?: number;
  color?: string;
}

export function LogoMark({ size = 52, color = '#FFFFFF' }: LogoMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 52 52" fill="none">
      <Path d="M6 34 Q13 26 20 30 Q27 34 34 26 Q41 18 46 22" stroke={color} strokeWidth="3" strokeLinecap="round" />
      <Path d="M6 42 Q13 34 20 38 Q27 42 34 34 Q41 26 46 30" stroke={color} strokeOpacity={0.55} strokeWidth="2.5" strokeLinecap="round" />
      <Path d="M18 10 L26 6 L34 10 L34 22 Q26 28 18 22 Z" stroke={color} strokeWidth="2" strokeLinejoin="round" fill={color} fillOpacity={0.2} />
      <Circle cx="26" cy="15" r="3" fill={color} />
    </Svg>
  );
}
