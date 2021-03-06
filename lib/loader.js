const {getOptions} = require('loader-utils');

async function ESBuildLoader(source) {
	const done = this.async();
	const options = getOptions(this);
	const service = this._compiler.$esbuildService;

	if (!service) {
		return done(
			new Error(
				'[esbuild-loader] You need to add ESBuildPlugin to your webpack config first',
			),
		);
	}

	const transformOptions = {
		...options,
		target: options.target || 'es2015',
		loader: options.loader || 'js',
		sourcemap: this.sourceMap,
		sourcefile: this.resourcePath,
	};

	try {
		const result = await service.transform(source, transformOptions).catch(async error => {
			// Target might be a TS file accidentally parsed as TSX
			if (transformOptions.loader === 'tsx' && error.message.includes('Unexpected')) {
				transformOptions.loader = 'ts';
				return service.transform(source, transformOptions).catch(_ => {
					throw error;
				});
			}

			throw error;
		});
		done(null, result.code, result.map);
	} catch (error) {
		done(error);
	}
}

module.exports = ESBuildLoader;
