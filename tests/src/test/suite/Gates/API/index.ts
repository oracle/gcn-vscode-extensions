import * as path from 'path';
import Mocha from 'mocha';
import glob from 'glob';

export function run(): Promise<void> {
	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd',
		color: true,
		reporter: 'mochawesome',
		reporterOptions: {
		  // disable overwrite to generate many JSON reports
		  overwrite: false,
		  // do not generate intermediate HTML reports
		  html: false,
		  // generate intermediate JSON reports
		  json: true,
		},
	});

	const testsRoot = path.resolve(__dirname, '..');

	return new Promise((c, e) => {
		glob.globSync('**/**extension.test.js', { cwd: testsRoot }).forEach(f => mocha.addFile(path.resolve(testsRoot, f)));
		try {
			// Run the mocha test
			mocha.run(failures => {
				if (failures > 0) {
					e(new Error(`${failures} tests failed.`));
				} else {
					c();
				}
			});
		} catch (err) {
			console.error(err);
			e(err);
		}
	});
}