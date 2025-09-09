module.exports = {
	env: { es2022: true, node: true, browser: true },
	root: true,
	ignorePatterns: ["dist", "coverage", "node_modules"],
	extends: ["eslint:recommended", "plugin:import/recommended"],
	parser: "@typescript-eslint/parser",
	parserOptions: { ecmaVersion: "latest", sourceType: "module", project: false },
	plugins: ["@typescript-eslint", "import"],
	overrides: [
		{
			files: ["**/*.ts", "**/*.tsx"],
			extends: [
				"plugin:@typescript-eslint/recommended",
				"plugin:import/typescript",
				"eslint-config-prettier"
			],
			rules: {
				"@typescript-eslint/consistent-type-imports": "warn",
				"import/no-unresolved": "off",
				"@typescript-eslint/no-unused-vars": [
					"warn",
					{ "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }
				]
			}
		}
	]
};
