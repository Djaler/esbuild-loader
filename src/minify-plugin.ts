// import {version} from '../package.json';
import assert from 'assert';
import {RawSource, SourceMapSource} from 'webpack-sources';
import { Compiler, MinifyPluginOptions } from './interfaces';
import * as webpack4 from 'webpack';
import * as webpack5 from 'webpack5';


type Asset = webpack4.compilation.Asset | ReturnType<webpack5.Compilation["getAsset"]>;

const version = 1;
const isJsFile = /\.js$/i;
const pluginName = 'esbuild-minify';

const flatMap = (array: any[], cb: (element: any) => any) => {
	assert(Array.isArray(array), 'arr is not an Array');
	return array.flatMap ? array.flatMap(cb) : [].concat(...array.map(cb)); // eslint-disable-line unicorn/no-fn-reference-in-iterator
};

function isWebpack5(compilation: webpack4.compilation.Compilation | webpack5.Compilation): compilation is webpack5.Compilation {
	return (compilation as webpack5.Compilation).hooks.processAssets !== undefined;
}

class ESBuildMinifyPlugin {
	private readonly options: MinifyPluginOptions;

	constructor(options: MinifyPluginOptions) {
		this.options = {...options};

		const hasMinify = Object.keys(this.options).some(k =>
			k.startsWith('minify'),
		);
		if (!hasMinify) {
			this.options.minify = true;
		}
	}

	apply(compiler: Compiler) {
		compiler.hooks.compilation.tap(pluginName, compilation => {
			if (!compiler.$esbuildService) {
				throw new Error(
					'[esbuild-loader] You need to add ESBuildPlugin to your webpack config first',
				);
			}

			const meta = JSON.stringify({
				name: 'esbuild-loader',
				version,
				options: this.options,
			});
			compilation.hooks.chunkHash.tap(pluginName, (_, hash) =>
				hash.update(meta),
			);

			if (isWebpack5(compilation)) {
				// Webpack 5
				compilation.hooks.processAssets.tapPromise(
					{
						name: pluginName,
						stage: (compilation.constructor as typeof webpack5.Compilation).PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE,
					},
					(assets) => this.transformAssets(compilation, Object.keys(assets)),
				);

				compilation.hooks.statsPrinter.tap(pluginName, stats => {
					stats.hooks.print
						.for('asset.info.minimized')
						.tap(pluginName, (minimized, {green, formatFlag}: any) =>
							minimized ? green(formatFlag('minimized')) : undefined,
						);
				});
			} else {
				// Webpack 4
				compilation.hooks.optimizeChunkAssets.tapPromise(
					pluginName,
					async chunks => {
						return this.transformAssets(
							compilation,
							flatMap(chunks, chunk => chunk.files),
						);
					},
				);
			}
		});
	}

	async transformAssets(
		compilation: webpack4.compilation.Compilation | webpack5.Compilation,
		assetNames: string[],
	) {
		const {
			options: {devtool},
			$esbuildService,
		} = compilation.compiler as Compiler;

		assert($esbuildService, 'esbuild-loader not instantiated');

		const sourcemap = (
			this.options.sourcemap === undefined ?
				devtool && (devtool as string).includes('source-map') :
				this.options.sourcemap
		);

		const transforms = assetNames
			.filter(assetName => isJsFile.test(assetName))
			.map((assetName): [string, Asset] => [
				assetName,
				compilation.getAsset(assetName),
			])
			.map(async ([
				assetName,
				{info, source: assetSource}
			]) => {
				const {source, map} = assetSource.sourceAndMap();
				const result = await $esbuildService.transform(source.toString(), {
					...this.options,
					sourcemap,
					sourcefile: assetName,
				});

				compilation.updateAsset(
					assetName,
					sourcemap ?
						new SourceMapSource(
							result.code || '',
							assetName,
							result.map,
							source && source.toString(),
							map || undefined,
							true,
						) :
						new RawSource(result.code || ''),
					{
						...info,
						minimized: true,
					},
				);
			});
		if (transforms.length > 0) {
			await Promise.all(transforms);
		}
	}
}

export default ESBuildMinifyPlugin;
