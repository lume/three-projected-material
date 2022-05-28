import {MeshPhysicalMaterial} from 'three/src/materials/MeshPhysicalMaterial.js'
import {PerspectiveCamera} from 'three/src/cameras/PerspectiveCamera.js'
import {Texture} from 'three/src/textures/Texture.js'
import {Vector2} from 'three/src/math/Vector2.js'
import {InstancedBufferAttribute} from 'three/src/core/InstancedBufferAttribute.js'
import {Matrix4} from 'three/src/math/Matrix4.js'
import {Vector3} from 'three/src/math/Vector3.js'
import {monkeyPatch, addLoadListener} from './three-utils.js'
import {version} from './version.js'

import type {
	BufferGeometry,
	Camera,
	InstancedMesh,
	Material,
	MeshPhysicalMaterialParameters,
	OrthographicCamera,
	Mesh,
} from 'three'

interface ProjectedMaterialParameters extends MeshPhysicalMaterialParameters {
	camera?: PerspectiveCamera | OrthographicCamera
	texture?: Texture
	textureScale?: number
	textureOffset?: Vector2
	fitment?: Fitment
	frontFacesOnly?: boolean
}

export class ProjectedMaterial extends MeshPhysicalMaterial {
	static version = version

	// internal values... they are exposed via getters
	#camera: PerspectiveCamera | OrthographicCamera = new PerspectiveCamera()
	#fitment: Fitment = 'contain'
	#textureScale = 1

	/**
	 * The camera to be used for texture projection. Any time you change this,
	 * also set `needsUpdate` to `true`.
	 * TODO set needsUpdate automatically.
	 */
	get camera() {
		return this.#camera
	}
	set camera(camera) {
		if (!camera || !camera.isCamera) {
			throw new Error('Invalid camera set to the ProjectedMaterial')
		}

		this.#camera = camera

		this.#saveDimensions()
		this.needsUpdate = true

		// toggle between two onBeforeCompile functions in order to force
		// WebGLRenderer to make a new program when toggled, or else the
		// renderer will not call onBeforeCompile again if we change the
		// `camera` (the renderer detects the material have changed if it
		// detects a different onBeforeCompile function), which means the
		// material.defines.ORTHOGRAPHIC value will not change when we've
		// changed the `camera` without this trick.
		// Issue: https://discourse.threejs.org/t/38614
		this.onBeforeCompile = isPerspectiveCamera(this.#camera)
			? this.#onBeforeCompilePerspective
			: this.#onBeforeCompileOrtho
	}

	get texture() {
		return this.uniforms.projectedTexture.value
	}
	set texture(texture) {
		if (!texture?.isTexture) {
			throw new Error('Invalid texture set to the ProjectedMaterial')
		}

		this.uniforms.projectedTexture.value = texture
		this.uniforms.isTextureLoaded.value = Boolean(texture.image)

		if (!this.uniforms.isTextureLoaded.value) {
			addLoadListener(texture, () => {
				this.uniforms.isTextureLoaded.value = true

				this.#saveDimensions()
			})
		} else {
			this.#saveDimensions()
		}
	}

	get textureScale() {
		return this.#textureScale
	}
	set textureScale(textureScale) {
		this.#textureScale = textureScale
		this.#saveDimensions()
	}

	get textureOffset() {
		return this.uniforms.textureOffset.value
	}
	set textureOffset(textureOffset) {
		this.uniforms.textureOffset.value = textureOffset
	}

	get fitment() {
		return this.#fitment
	}
	set fitment(value) {
		this.#fitment = value
		this.#saveDimensions()
	}

	get frontFacesOnly() {
		return this.uniforms.frontFacesOnly.value
	}
	set frontFacesOnly(frontFacesOnly) {
		this.uniforms.frontFacesOnly.value = frontFacesOnly
	}

	uniforms
	readonly isProjectedMaterial = true

	constructor({
		camera,
		texture = new Texture(),
		textureScale,
		textureOffset = new Vector2(),
		fitment,
		frontFacesOnly = true,
		...options
	}: ProjectedMaterialParameters = {}) {
		if (!texture.isTexture) {
			throw new Error('Invalid texture passed to the ProjectedMaterial')
		}

		if (camera && !camera.isCamera) {
			throw new Error('Invalid camera passed to the ProjectedMaterial')
		}

		super(options)

		Object.defineProperty(this, 'isProjectedMaterial', {value: this.isProjectedMaterial})

		this.#fitment = fitment ?? this.#fitment
		this.#textureScale = textureScale ?? this.#textureScale

		this.uniforms = {
			projectedTexture: {value: texture},
			// this avoids rendering black if the texture
			// hasn't loaded yet
			isTextureLoaded: {value: Boolean(texture.image)},
			// don't show the texture if we haven't called project()
			isTextureProjected: {value: false},
			// if we have multiple materials we want to show the
			// background only of the first material
			backgroundOpacity: {value: 1},
			// these will be set on project()
			viewMatrixCamera: {value: new Matrix4()},
			projectionMatrixCamera: {value: new Matrix4()},
			projPosition: {value: new Vector3()},
			projDirection: {value: new Vector3(0, 0, -1)},
			// we will set this later when we will have positioned the object
			savedModelMatrix: {value: new Matrix4()},
			widthScaled: {value: 1},
			heightScaled: {value: 1},
			textureOffset: {value: textureOffset},
			frontFacesOnly: {value: frontFacesOnly},
		}

		if (camera) this.camera = camera

		this.#saveDimensions()

		// If the image texture passed hasn't loaded yet,
		// wait for it to load and compute the correct proportions.
		// This avoids rendering black while the texture is loading
		addLoadListener(texture, () => {
			this.uniforms.isTextureLoaded.value = true

			this.#saveDimensions()
		})
	}

	#onBeforeCompilePerspective: this['onBeforeCompile'] = (shader, ...args) => {
		// @ts-expect-error material ✨
		delete shader.defines.ORTHOGRAPHIC

		this.#onBeforeCompileCommon(shader, ...args)
	}

	#onBeforeCompileOrtho: this['onBeforeCompile'] = (shader, ...args) => {
		// @ts-expect-error material ✨
		shader.defines.ORTHOGRAPHIC = ''

		this.#onBeforeCompileCommon(shader, ...args)
	}

	#onBeforeCompileCommon: this['onBeforeCompile'] = shader => {
		// expose also the material's uniforms
		Object.assign(this.uniforms, shader.uniforms)
		shader.uniforms = this.uniforms

		shader.vertexShader = monkeyPatch(shader.vertexShader, {
			header: /* glsl */ `
					uniform mat4 viewMatrixCamera;
					uniform mat4 projectionMatrixCamera;

					#ifdef USE_INSTANCING
					attribute vec4 savedModelMatrix0;
					attribute vec4 savedModelMatrix1;
					attribute vec4 savedModelMatrix2;
					attribute vec4 savedModelMatrix3;
					#else
					uniform mat4 savedModelMatrix;
					#endif

					varying vec3 vSavedNormal;
					varying vec4 vTexCoords;
					#ifndef ORTHOGRAPHIC
					varying vec4 vWorldPosition;
					#endif
				`,
			main: /* glsl */ `
					#ifdef USE_INSTANCING
					mat4 savedModelMatrix = mat4(
						savedModelMatrix0,
						savedModelMatrix1,
						savedModelMatrix2,
						savedModelMatrix3
					);
					#endif

					vSavedNormal = mat3(savedModelMatrix) * normal;
					vTexCoords = projectionMatrixCamera * viewMatrixCamera * savedModelMatrix * vec4(position, 1.0);
					#ifndef ORTHOGRAPHIC
					vWorldPosition = savedModelMatrix * vec4(position, 1.0);
					#endif
				`,
		})

		shader.fragmentShader = monkeyPatch(shader.fragmentShader, {
			header: /* glsl */ `
					uniform sampler2D projectedTexture;
					uniform bool isTextureLoaded;
					uniform bool isTextureProjected;
					uniform float backgroundOpacity;
					uniform vec3 projPosition;
					uniform vec3 projDirection;
					uniform float widthScaled;
					uniform float heightScaled;
					uniform vec2 textureOffset;
					uniform bool frontFacesOnly;

					varying vec3 vSavedNormal;
					varying vec4 vTexCoords;
					#ifndef ORTHOGRAPHIC
					varying vec4 vWorldPosition;
					#endif

					float mapRange(float value, float min1, float max1, float min2, float max2) {
						return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
					}
				`,
			'vec4 diffuseColor = vec4( diffuse, opacity );': /* glsl */ `
					// clamp the w to make sure we don't project behind
					float w = max(vTexCoords.w, 0.0);

					vec2 uv = (vTexCoords.xy / w) * 0.5 + 0.5;

					uv += textureOffset;

					// apply the corrected width and height
					uv.x = mapRange(uv.x, 0.0, 1.0, 0.5 - widthScaled / 2.0, 0.5 + widthScaled / 2.0);
					uv.y = mapRange(uv.y, 0.0, 1.0, 0.5 - heightScaled / 2.0, 0.5 + heightScaled / 2.0);

					// this makes sure we don't sample out of the texture
					bool isInTexture = (max(uv.x, uv.y) <= 1.0 && min(uv.x, uv.y) >= 0.0);

					// this makes sure we don't render also the back of the object if frontFacesOnly is true
					// FIXME projection direction is wrong in some cases, namely
					// when the camera and the target are both a child and not at the
					// scene origin.
					#ifdef ORTHOGRAPHIC
					vec3 projectorDirection = projDirection;
					#else
					vec3 projectorDirection = normalize(projPosition - vWorldPosition.xyz);
					#endif
					float dotProduct = dot(vSavedNormal, projectorDirection);
					bool isFacingProjector = frontFacesOnly ? dotProduct > 0.0000001 : true;


					vec4 diffuseColor = vec4(diffuse, opacity * backgroundOpacity);

					if (isFacingProjector && isInTexture && isTextureLoaded && isTextureProjected) {
						vec4 textureColor = texture2D(projectedTexture, uv);

						// apply the material opacity
						textureColor.a *= opacity;

						// https://learnopengl.com/Advanced-OpenGL/Blending
						diffuseColor = textureColor * textureColor.a + diffuseColor * (1.0 - textureColor.a);
					}
				`,
		})
	}

	/**
	 * Call this any time the camera-specific parameters have been updated
	 * externally. Non-camera-specific changes are otherwise covered by the project()
	 * method.
	 */
	updateFromCamera() {
		this.uniforms.projectionMatrixCamera.value.copy(this.camera.projectionMatrix)
		this.#saveDimensions()
	}

	#saveDimensions() {
		// scale to keep the image proportions and apply textureScale
		computeScaledDimensions(this.texture, this.camera, this.textureScale, this.fitment, size)

		this.uniforms.widthScaled.value = size.x
		this.uniforms.heightScaled.value = size.y
	}

	#saveCameraMatrices(updateWorldMatrices = true) {
		// make sure the camera matrices are updated
		this.camera.updateProjectionMatrix() // TODO move to updateFromCamera()
		if (updateWorldMatrices) {
			this.camera.updateMatrixWorld()
			this.camera.updateWorldMatrix(true, false)
		}

		// update the uniforms from the camera so they're
		// fixed in the camera's position at the projection time
		const viewMatrixCamera = this.camera.matrixWorldInverse
		const projectionMatrixCamera = this.camera.projectionMatrix
		const modelMatrixCamera = this.camera.matrixWorld

		this.uniforms.viewMatrixCamera.value.copy(viewMatrixCamera) // TODO rename to cameraMatrixWorldInverse
		this.uniforms.projectionMatrixCamera.value.copy(projectionMatrixCamera) // TODO move to updateFromCamera()
		this.uniforms.projPosition.value.copy(this.camera.position)
		this.uniforms.projDirection.value.set(0, 0, 1).applyMatrix4(modelMatrixCamera)

		// tell the shader we've projected
		this.uniforms.isTextureProjected.value = true
	}

	/**
	 * Call this any time the projection camera or the object with the
	 * ProjectedMaterial have been transformed.
	 */
	project(mesh: Mesh, updateWorldMatrices = true) {
		if (!isProjectedMaterial(mesh.material)) {
			throw new Error(`The mesh material must be a ProjectedMaterial`)
		}

		if (
			!(Array.isArray(mesh.material) ? mesh.material.some(m => m === this) : mesh.material === this)
		) {
			throw new Error(
				`The provided mesh doesn't have the same material as where project() has been called from`,
			)
		}

		// make sure the matrix is updated
		if (updateWorldMatrices) mesh.updateWorldMatrix(true, false)

		// we save the object model matrix so it's projected relative
		// to that position, like a snapshot
		this.uniforms.savedModelMatrix.value.copy(mesh.matrixWorld)

		// if the material is not the first, output just the texture
		if (Array.isArray(mesh.material)) {
			const materialIndex = mesh.material.indexOf(this)
			if (!mesh.material[materialIndex].transparent) {
				throw new Error(
					`You have to pass "transparent: true" to the ProjectedMaterial if you're working with multiple materials.`,
				)
			}
			if (materialIndex > 0) {
				this.uniforms.backgroundOpacity.value = 0
			}
		}

		// persist also the current camera position and matrices
		this.#saveCameraMatrices(updateWorldMatrices)
	}

	projectInstanceAt(
		index: number,
		instancedMesh: InstancedMesh,
		matrixWorld: Matrix4,
		{forceCameraSave = false} = {},
	) {
		if (!instancedMesh.isInstancedMesh) {
			throw new Error(`The provided mesh is not an InstancedMesh`)
		}

		if (!isProjectedMaterial(instancedMesh.material)) {
			throw new Error(`The InstancedMesh material must be a ProjectedMaterial`)
		}

		if (
			!(Array.isArray(instancedMesh.material)
				? instancedMesh.material.some(m => m === this)
				: instancedMesh.material === this)
		) {
			throw new Error(
				`The provided InstancedMeshhave't i samenclude thas e material where project() has been called from`,
			)
		}

		if (
			!instancedMesh.geometry.attributes[`savedModelMatrix0`] ||
			!instancedMesh.geometry.attributes[`savedModelMatrix1`] ||
			!instancedMesh.geometry.attributes[`savedModelMatrix2`] ||
			!instancedMesh.geometry.attributes[`savedModelMatrix3`]
		) {
			throw new Error(
				`No allocated data found on the geometry, please call 'allocateProjectionData(geometry, instancesCount)'`,
			)
		}

		instancedMesh.geometry.attributes[`savedModelMatrix0`].setXYZW(
			index,
			matrixWorld.elements[0],
			matrixWorld.elements[1],
			matrixWorld.elements[2],
			matrixWorld.elements[3],
		)
		instancedMesh.geometry.attributes[`savedModelMatrix1`].setXYZW(
			index,
			matrixWorld.elements[4],
			matrixWorld.elements[5],
			matrixWorld.elements[6],
			matrixWorld.elements[7],
		)
		instancedMesh.geometry.attributes[`savedModelMatrix2`].setXYZW(
			index,
			matrixWorld.elements[8],
			matrixWorld.elements[9],
			matrixWorld.elements[10],
			matrixWorld.elements[11],
		)
		instancedMesh.geometry.attributes[`savedModelMatrix3`].setXYZW(
			index,
			matrixWorld.elements[12],
			matrixWorld.elements[13],
			matrixWorld.elements[14],
			matrixWorld.elements[15],
		)

		// if the material is not the first, output just the texture
		if (Array.isArray(instancedMesh.material)) {
			const materialIndex = instancedMesh.material.indexOf(this)
			if (!instancedMesh.material[materialIndex].transparent) {
				throw new Error(
					`You have to pass "transparent: true" to the ProjectedMaterial if you're working with multiple materials.`,
				)
			}
			if (materialIndex > 0) {
				this.uniforms.backgroundOpacity.value = 0
			}
		}

		// persist the current camera position and matrices
		// only if it's the first instance since most surely
		// in all other instances the camera won't change
		if (index === 0 || forceCameraSave) {
			this.#saveCameraMatrices()
		}
	}

	copy(source: this) {
		super.copy(source)

		this.camera = source.camera
		this.texture = source.texture
		this.textureScale = source.textureScale
		this.textureOffset = source.textureOffset
		this.fitment = source.fitment

		return this
	}
}

// get camera ratio from different types of cameras
function getCameraRatio(camera: PerspectiveCamera | OrthographicCamera) {
	switch (camera.type) {
		case 'PerspectiveCamera': {
			return camera.aspect
		}
		case 'OrthographicCamera': {
			const width = Math.abs(camera.right - camera.left)
			const height = Math.abs(camera.top - camera.bottom)
			return width / height
		}
		default: {
			throw new Error(`The given type of camera is currently not supported in ProjectedMaterial`)
		}
	}
}

const size: Vec2 = {x: 1, y: 1}

// scale to keep the image proportions and apply textureScale
function computeScaledDimensions(
	texture: Texture,
	camera: PerspectiveCamera | OrthographicCamera,
	textureScale: number,
	fitment: Fitment,
	outputSize: Vec2,
): void {
	// return some default values if the image hasn't loaded yet
	if (!texture.image) {
		outputSize.x = 1
		outputSize.y = 1
		return
	}

	// return if it's a video and if the video hasn't loaded yet
	if (texture.image.videoWidth === 0 && texture.image.videoHeight === 0) {
		outputSize.x = 1
		outputSize.y = 1
		return
	}

	const sourceWidth =
		texture.image.naturalWidth || texture.image.videoWidth || texture.image.clientWidth
	const sourceHeight =
		texture.image.naturalHeight || texture.image.videoHeight || texture.image.clientHeight

	const cameraWidth = 1
	const ratioCamera = getCameraRatio(camera)
	const cameraHeight = cameraWidth * (1 / ratioCamera)
	const ratio = sourceWidth / sourceHeight

	if (fitment === 'cover' ? ratio > ratioCamera : ratio < ratioCamera) {
		const width = cameraHeight * ratio
		outputSize.x = 1 / ((width / cameraWidth) * textureScale)
		outputSize.y = 1 / textureScale
	} else {
		const height = cameraWidth * (1 / ratio)
		outputSize.x = 1 / textureScale
		outputSize.y = 1 / ((height / cameraHeight) * textureScale)
	}
}

export function allocateProjectionData(geometry: BufferGeometry, instancesCount: number) {
	geometry.setAttribute(
		`savedModelMatrix0`,
		new InstancedBufferAttribute(new Float32Array(instancesCount * 4), 4),
	)
	geometry.setAttribute(
		`savedModelMatrix1`,
		new InstancedBufferAttribute(new Float32Array(instancesCount * 4), 4),
	)
	geometry.setAttribute(
		`savedModelMatrix2`,
		new InstancedBufferAttribute(new Float32Array(instancesCount * 4), 4),
	)
	geometry.setAttribute(
		`savedModelMatrix3`,
		new InstancedBufferAttribute(new Float32Array(instancesCount * 4), 4),
	)
}

export function isOrthographicCamera(cam: Camera): cam is OrthographicCamera {
	return (cam as OrthographicCamera).isOrthographicCamera
}

export function isPerspectiveCamera(cam: Camera): cam is PerspectiveCamera {
	return (cam as PerspectiveCamera).isPerspectiveCamera
}

export function isProjectedMaterial(mat: Material | Material[]): mat is ProjectedMaterial {
	const _mat = mat as ProjectedMaterial | ProjectedMaterial[]
	return Array.isArray(_mat) ? _mat.every(m => m.isProjectedMaterial) : _mat.isProjectedMaterial
}

export type Fitment = 'contain' | 'cover'

export interface Vec2 {
	x: number
	y: number
}
