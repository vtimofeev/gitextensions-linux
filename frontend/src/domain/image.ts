// The backend checks the bytes before returning an image preview.
export function isImageFile(file: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|ico|svg)$/i.test(file);
}
