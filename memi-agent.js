#!/usr/bin/env node

const { dispatch } = require("./cli");

dispatch(process.argv.slice(2));
