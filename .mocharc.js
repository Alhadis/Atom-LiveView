"use strict";

module.exports = {
	bail: true,
	require: [
		"chai/register-should",
		"mocha-when/register",
	],
	slow: 9999,
	specPattern: /-spec\.js$/i,
};
