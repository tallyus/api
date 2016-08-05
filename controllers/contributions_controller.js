"use strict";

var debug = require('debug')('controllers:events_controller:' + process.pid),
    _ = require("lodash"),
    util = require('util'),
    path = require('path'),
    async = require("async"),
    Router = require("express").Router,
    models = require('../models/index.js')

// will need to handle query param or way to get more events

function getEventContributions(req, res, next) {
  debug("getEventContributions");
  models.Event.findAll({
    where: {eventId: req.eventId },
    attributes: ['id', 'isPinned', 'imageUrl', 'imageAttribution', 'politicianId', 'headline', 'summary', 'createdAt', 'updatedAt'],
    limit: 10,
    order: '"id" DESC'
  }).then(function(events, err) {
    debug(events);
    req.events = events;
    next()
  });
}

module.exports = function() {
  var router = new Router();

  router.route("/events/:id/contributions").get(getEventContributions, function(req, res, next) {
    debug("in /events");
    return res.status(200).json(req.events);
  });

  return router;
}
