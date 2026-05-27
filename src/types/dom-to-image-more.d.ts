declare module 'dom-to-image-more' {
  export interface Options {
    width?: number;
    height?: number;
    style?: Record<string, string | number>;
    quality?: number;
    bgcolor?: string;
    imagePlaceholder?: string;
    cacheBust?: boolean;
    scrollFix?: boolean;
  }

  export function toPng(node: HTMLElement, options?: Options): Promise<string>;
  export function toSvg(node: HTMLElement, options?: Options): Promise<string>;
  export function toJpeg(node: HTMLElement, options?: Options): Promise<string>;
  export function toBlob(node: HTMLElement, options?: Options): Promise<Blob>;
  export function toPixelData(node: HTMLElement, options?: Options): Promise<Uint8ClampedArray>;

  const domtoimage: {
    toPng: typeof toPng;
    toSvg: typeof toSvg;
    toJpeg: typeof toJpeg;
    toBlob: typeof toBlob;
    toPixelData: typeof toPixelData;
  };

  export default domtoimage;
}
