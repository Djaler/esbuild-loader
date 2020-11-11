import {getOptions} from 'loader-utils';
import * as webpack4 from 'webpack';
import { Compiler, LoaderOptions } from './interfaces';

async function ESBuildLoader(
	this: webpack4.loader.LoaderContext,
	source: string
) {
	const done = this.async() as webpack4.loader.loaderCallback;
	const options = (getOptions(this) || {}) as LoaderOptions;
	const service = (this._compiler as Compiler).$esbuildService;

	if (!service) {
		return done(
			new Error(
				'[esbuild-loader] You need to add ESBuildPlugin to your webpack config first',
			),
		);
	}

	try {
		const result = await service.transform(source, {
			...options,
			target: options.target ?? 'es2015',
			loader: options.loader ?? 'js',
			sourcemap: this.sourceMap,
			sourcefile: this.resourcePath,
		});

		done(null, result.code, result.map);
	} catch (error) {
		done(error);
	}
}

export default ESBuildLoader;
