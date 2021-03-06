"use strict";

var async = require('async'),
	winston = require('winston'),
	templates = require('templates.js'),
	os = require('os'),
	nconf = require('nconf'),

	user = require('./user'),
	groups = require('./groups'),
	emitter = require('./emitter'),
	pubsub = require('./pubsub'),
	auth = require('./routes/authentication');

(function (Meta) {
	Meta.reloadRequired = false;

	require('./meta/configs')(Meta);
	require('./meta/themes')(Meta);
	require('./meta/title')(Meta);
	require('./meta/js')(Meta);
	require('./meta/css')(Meta);
	require('./meta/sounds')(Meta);
	require('./meta/settings')(Meta);
	require('./meta/logs')(Meta);
	require('./meta/tags')(Meta);
	Meta.templates = require('./meta/templates');

	/* Assorted */
	Meta.userOrGroupExists = function(slug, callback) {
		async.parallel([
			async.apply(user.exists, slug),
			async.apply(groups.existsBySlug, slug)
		], function(err, results) {
			callback(err, results ? results.some(function(result) { return result; }) : false);
		});
	};

	Meta.reload = function(callback) {
		pubsub.publish('meta:reload', {hostname: os.hostname()});
		reload(callback);
	};

	pubsub.on('meta:reload', function(data) {
		if (data.hostname !== os.hostname()) {
			reload();
		}
	});

	function reload(callback) {
		callback = callback || function() {};

		var	plugins = require('./plugins');
		async.series([
			async.apply(plugins.clearRequireCache),
			async.apply(plugins.reload),
			async.apply(plugins.reloadRoutes),
			function(next) {
				async.parallel([
					async.apply(Meta.js.minify, false),
					async.apply(Meta.css.minify),
					async.apply(Meta.sounds.init),
					async.apply(Meta.templates.compile),
					async.apply(auth.reloadRoutes),
					function(next) {
						templates.flush();
						next();
					}
				], next);
			}
		], function(err) {
			if (!err) {
				emitter.emit('nodebb:ready');
			}
			Meta.reloadRequired = false;

			callback(err);
		});
	}

	Meta.restart = function() {
		pubsub.publish('meta:restart', {hostname: os.hostname()});
		restart();
	};

	if (nconf.get('isPrimary') === 'true') {
		pubsub.on('meta:restart', function(data) {
			if (data.hostname !== os.hostname()) {
				restart();
			}
		});
	}

	function restart() {
		if (process.send) {
			process.send({
				action: 'restart'
			});
		} else {
			winston.error('[meta.restart] Could not restart, are you sure NodeBB was started with `./nodebb start`?');
		}
	}
}(exports));
