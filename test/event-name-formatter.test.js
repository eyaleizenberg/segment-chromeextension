const assert = require('node:assert/strict');
const test = require('node:test');

const { toSnakeCase } = require('../event-name-formatter');

test('formats camelCase event names as snake_case for display', () => {
	assert.equal(
		toSnakeCase('userViewedCoCreatorHomeModule'),
		'user_viewed_co_creator_home_module'
	);
});

test('preserves a leading underscore while converting acronym boundaries', () => {
	assert.equal(
		toSnakeCase('_eppoExperimentAssignment'),
		'_eppo_experiment_assignment'
	);
});

test('formats spaced event names as snake_case for display', () => {
	assert.equal(toSnakeCase('Page Loaded'), 'page_loaded');
});
