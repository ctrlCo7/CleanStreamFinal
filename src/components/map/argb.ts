/** Android colour int (ARGB, signed 32-bit) from '#RRGGBB', as Petal Maps (HUAWEI Map Kit) expects. */
export const argb = (hex: string, alpha = 1): number =>
  ((Math.round(alpha * 255) << 24) | parseInt(hex.slice(1), 16)) | 0;
