import type {Texture} from 'three'

export function monkeyPatch(
	shader: string,
	{defines = {} as Record<string, string>, header = '', main = '', ...replacements},
) {
	let patchedShader = shader

	const replaceAll = (str: string, find: string, rep: string) => str.split(find).join(rep)

	Object.keys(replacements).forEach(key => {
		patchedShader = replaceAll(patchedShader, key, replacements[key])
	})

	patchedShader = patchedShader.replace(
		'void main() {',
		`
			${header}
			void main() {
				${main}
		`,
	)

	const stringDefines = Object.keys(defines)
		.map(d => `#define ${d} ${defines[d]}`)
		.join('\n')

	return `
		${stringDefines}
		${patchedShader}
	`
}

// run the callback when the image will be loaded
export function addLoadListener(texture: Texture, callback: (t: Texture) => void) {
	// return if it's already loaded
	if (texture.image && texture.image.videoWidth !== 0 && texture.image.videoHeight !== 0) {
		return
	}

	const interval = setInterval(() => {
		if (texture.image && texture.image.videoWidth !== 0 && texture.image.videoHeight !== 0) {
			clearInterval(interval)
			return callback(texture)
		}
	}, 16)
}
