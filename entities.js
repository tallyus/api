'use strict'

var async = require("async")
var redisKeys = require('./redis-keys')

module.exports = function(redis) {
    var entities = {}

    entities.getPolitician = function(iden, callback) {
        redis.hget(redisKeys.politicians, iden, function(err, reply) {
            if (err) {
                callback(err)
            } else if (reply) {
                callback(null, JSON.parse(reply))
            } else {
                callback()
            }
        })
    }

    entities.listPoliticians = function(callback) {
        redis.hgetall(redisKeys.politicians, function(err, reply) {
            if (err) {
                callabck(err)
            } else {
                var politicians = []
                if (reply) {
                    Object.keys(reply).forEach(function(iden) {
                        politicians.push(JSON.parse(reply[iden]))
                    })
                }

                callback(null, sortByName(politicians))
            }
        })
    }

    entities.getEvent = function(iden, callback) {
        redis.hget(redisKeys.events, iden, function(err, reply) {
            if (err) {
                callback(err)
            } else if (reply) {
                callback(null, JSON.parse(reply))
            } else {
                callback()
            }
        })
    }

    entities.listEvents = function(callback) {
        redis.lrange(redisKeys.reverseChronologicalEvents, 0, -1, function(err, reply) {
            if (err) {
                callback(err)
            } else {
                var tasks = []
                reply.forEach(function(iden) {
                    tasks.push(function(callback) {
                        entities.getEvent(iden, function(err, event) {
                            callback(err, event)
                        })
                    })
                })

                async.series(tasks, function(err, results) {
                    if (err) {
                        callback(err)
                    } else {
                        callback(null, results)
                    }
                })
            }
        })
    }

    entities.listPacs = function(callback) {
        redis.hgetall(redisKeys.pacs, function(err, reply) {
            if (err) {
                callabck(err)
            } else {
                var pacs = []
                if (reply) {
                    Object.keys(reply).forEach(function(iden) {
                        pacs.push(JSON.parse(reply[iden]))
                    })
                }

                callback(null, sortByName(pacs))
            }
        })
    }

    entities.getPac = function(iden, callback) {
        redis.hget(redisKeys.pacs, iden, function(err, reply) {
            if (err) {
                callback(err)
            } else if (reply) {
                callback(null, JSON.parse(reply))
            } else {
                callback()
            }
        })
    }

    entities.listUserDonations = function(iden, callback) {
        redis.lrange(redisKeys.userReverseChronologicalDonations(iden), 0, -1, function(err, reply) {
            if (err) {
                callback(err)
            } else {
                var tasks = []
                reply.forEach(function(iden) {
                    tasks.push(function(callback) {
                        entities.getDonation(iden, function(err, donation) {
                            callback(err, donation)
                        })
                    })
                })

                async.parallel(tasks, function(err, results) {
                    if (err) {
                        callback(err)
                    } else {
                        callback(null, results)
                    }
                })
            }
        })

        entities.getDonation = function(iden, callback) {
            redis.hget(redisKeys.donations, iden, function(err, reply) {
                if (err) {
                    callback(err)
                } else if (reply) {
                    callback(null, JSON.parse(reply))
                } else {
                    callback()
                }
            })
        }
    }

    return entities
}

var sortByName = function(items) {
    return items.sort(function(a, b) {
        if (a.name > b.name) {
            return 1
        } else if (a.name < b.name) {
            return -1
        } else {
            return 0
        }
    })
}
