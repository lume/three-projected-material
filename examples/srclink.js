{
	const filename = location.href.split('/').pop()
	const srclink = `https://github.com/lume/three-projected-material/blob/${gitref}/examples/${filename}`

	document.write(/*html*/ `
		<a
			class="source-fab"
			target="_blank"
			href="${srclink}"
			title="View source code on GitHub"
		>
			<img src="images/source.svg" />
		</a>
	`)
}
