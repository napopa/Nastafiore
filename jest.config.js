module.exports = {
	preset: 'jest-expo',
	testMatch: ['**/__tests__/**/*.test.js'],
	moduleNameMapper: { '^~/(.*)$': '<rootDir>/app/$1' },
	clearMocks: true,
}
