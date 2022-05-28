import { MeshPhysicalMaterial } from 'three/src/materials/MeshPhysicalMaterial.js';
import { PerspectiveCamera } from 'three/src/cameras/PerspectiveCamera.js';
import { Texture } from 'three/src/textures/Texture.js';
import { Vector2 } from 'three/src/math/Vector2.js';
import { Matrix4 } from 'three/src/math/Matrix4.js';
import { Vector3 } from 'three/src/math/Vector3.js';
import type { BufferGeometry, Camera, InstancedMesh, Material, MeshPhysicalMaterialParameters, OrthographicCamera, Mesh } from 'three';
interface ProjectedMaterialParameters extends MeshPhysicalMaterialParameters {
    camera?: PerspectiveCamera | OrthographicCamera;
    texture?: Texture;
    textureScale?: number;
    textureOffset?: Vector2;
    fitment?: Fitment;
    frontFacesOnly?: boolean;
}
export declare class ProjectedMaterial extends MeshPhysicalMaterial {
    #private;
    static version: string;
    /**
     * The camera to be used for texture projection. Any time you change this,
     * also set `needsUpdate` to `true`.
     * TODO set needsUpdate automatically.
     */
    get camera(): PerspectiveCamera | OrthographicCamera;
    set camera(camera: PerspectiveCamera | OrthographicCamera);
    get texture(): Texture;
    set texture(texture: Texture);
    get textureScale(): number;
    set textureScale(textureScale: number);
    get textureOffset(): Vector2;
    set textureOffset(textureOffset: Vector2);
    get fitment(): Fitment;
    set fitment(value: Fitment);
    get frontFacesOnly(): boolean;
    set frontFacesOnly(frontFacesOnly: boolean);
    uniforms: {
        projectedTexture: {
            value: Texture;
        };
        isTextureLoaded: {
            value: boolean;
        };
        isTextureProjected: {
            value: boolean;
        };
        backgroundOpacity: {
            value: number;
        };
        viewMatrixCamera: {
            value: Matrix4;
        };
        projectionMatrixCamera: {
            value: Matrix4;
        };
        projPosition: {
            value: Vector3;
        };
        projDirection: {
            value: Vector3;
        };
        savedModelMatrix: {
            value: Matrix4;
        };
        widthScaled: {
            value: number;
        };
        heightScaled: {
            value: number;
        };
        textureOffset: {
            value: Vector2;
        };
        frontFacesOnly: {
            value: boolean;
        };
    };
    readonly isProjectedMaterial = true;
    constructor({ camera, texture, textureScale, textureOffset, fitment, frontFacesOnly, ...options }?: ProjectedMaterialParameters);
    /**
     * Call this any time the camera-specific parameters have been updated
     * externally. Non-camera-specific changes are otherwise covered by the project()
     * method.
     */
    updateFromCamera(): void;
    /**
     * Call this any time the projection camera or the object with the
     * ProjectedMaterial have been transformed.
     */
    project(mesh: Mesh, updateWorldMatrices?: boolean): void;
    projectInstanceAt(index: number, instancedMesh: InstancedMesh, matrixWorld: Matrix4, { forceCameraSave }?: {
        forceCameraSave?: boolean | undefined;
    }): void;
    copy(source: this): this;
}
export declare function allocateProjectionData(geometry: BufferGeometry, instancesCount: number): void;
export declare function isOrthographicCamera(cam: Camera): cam is OrthographicCamera;
export declare function isPerspectiveCamera(cam: Camera): cam is PerspectiveCamera;
export declare function isProjectedMaterial(mat: Material | Material[]): mat is ProjectedMaterial;
export declare type Fitment = 'contain' | 'cover';
export interface Vec2 {
    x: number;
    y: number;
}
export {};
