"use strict";

module.exports = {
	require: [
		"chai/register-should",
		"mocha-when/register",
	],
	slow: 9999,
	specPattern: /-spec\.js$/i,
};
