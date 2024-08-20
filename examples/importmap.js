let gitref = ''

{
	const isGithack = location.origin.includes('githack.com')
	gitref = (isGithack && location.href.split('/')[5]) || 'main'

	const imports = {
		'three-projected-material': '../dist/ProjectedMaterial.js',
		'three-projected-material/': '../',
		...(isGithack
			? {
					three: 'https://cdn.jsdelivr.net/npm/three@0.158.0/src/Three.js',
					'three/': 'https://cdn.jsdelivr.net/npm/three@0.158.0/',
			  }
			: {
					three: '/node_modules/three/src/Three.js',
					'three/': '/node_modules/three/',
			  }),
	}

	document.write(/*html*/ `
		<script type="importmap">
			{
				"imports": ${JSON.stringify(imports, null, 4)}
			}
		</script>
	`)
}
