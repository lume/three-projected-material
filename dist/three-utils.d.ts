import type { Texture } from 'three';
export declare function monkeyPatch(shader: string, { defines, header, main, ...replacements }: {
    [x: string]: any;
    defines?: Record<string, string> | undefined;
    header?: string | undefined;
    main?: string | undefined;
}): string;
export declare function addLoadListener(texture: Texture, callback: (t: Texture) => void): void;
//# sourceMappingURL=three-utils.d.ts.map