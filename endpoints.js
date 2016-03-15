'use strict'

var async = require("async")
var request = require('request')
var crypto = require('crypto')
var redisKeys = require('./redis-keys')
var stripe = require('stripe')('sk_test_rtBOxo0prIIbfVocTi4l1gPC')
var sendgrid  = require('sendgrid')('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')

module.exports = function(app, redis) {
    var entities = require('./entities')(redis)

    app.get('/', function(req, res) {
        res.json({
            'revitalizingDemocracy': true
        })
    })

    app.post('/v1/authenticate', function(req, res) {
        getFacebookUserInfo(req.body.facebookToken, function(valid, info) {
            if (valid && info) {
                redis.hget(redisKeys.facebookUserIdToUserIden, info.id, function(err, reply) {
                    if (err) {
                        res.sendStatus(500)
                        console.error(err)
                    } else if (reply) {
                        var userIden = reply
                        redis.hget(redisKeys.userIdenToAccessToken, userIden, function(err, reply) {
                            if (err) {
                                res.sendStatus(500)
                                console.error(err)
                            } else if (reply) {
                                res.json({
                                    'accessToken': reply
                                })
                            } else {
                                res.sendStatus(500)
                                console.error('entry for ' + userIden + ' missing in ' + redisKeys.userIdenToAccessToken)
                            }
                        })
                    } else {
                        var now = Date.now() / 1000

                        var user = {
                            'iden': generateIden(),
                            'facebookId': info.id,
                            'name': info.name,
                            'email': info.email,
                            'created': now,
                            'modified': now
                        }

                        var accessToken = crypto.randomBytes(64).toString('hex')

                        var tasks = []
                        tasks.push(function(callback) {
                            redis.hset(redisKeys.users, user.iden, JSON.stringify(user), function(err, reply) {
                                callback(err, reply)
                            })
                        })
                        tasks.push(function(callback) {
                            redis.hset(redisKeys.userIdenToAccessToken, user.iden, accessToken, function(err, reply) {
                                callback(err, reply)
                            })
                        })
                        tasks.push(function(callback) {
                            redis.hset(redisKeys.accessTokenToUserIden, accessToken, user.iden, function(err, reply) {
                                callback(err, reply)
                            })
                        })
                        tasks.push(function(callback) { // This must come last (order matters in case something fails)
                            redis.hset(redisKeys.facebookUserIdToUserIden, info.id, user.iden, function(err, reply) {
                                callback(err, reply)
                            })
                        })

                        async.series(tasks, function(err, results) { // Must be series since order matters
                            if (err) {
                                res.sendStatus(500)
                                console.error(err)
                            } else {
                                res.json({
                                    'accessToken': accessToken
                                })
                            }
                        })
                    }
                })
            } else {
                res.sendStatus(400)
            }
        })
    })

    app.post('/v1/get-user-data', function(req, res) {
        var tasks = []
        tasks.push(function(callback) {
            redis.hget(redisKeys.userIdenToStripeCustomerId, req.user.iden, function(err, reply) {
                callback(err, reply)
            })
        })
        tasks.push(function(callback) {
            entities.listUserContributions(req.user.iden, function(err, contributions) {
                callback(err, contributions)
            })
        })

        async.parallel(tasks, function(err, results) {
            if (err) {
                res.sendStatus(500)
                console.error(err)
            } else {
                res.json({
                    'profile': req.user,
                    'chargeable': !!results[0],
                    'contributions': results[1]
                })
            }
        })
    })

    app.post('/v1/update-profile', function(req, res) {
        if (req.body.name) {
            req.user.name = req.body.name
        }
        if (req.body.occupation) {
            req.user.occupation = req.body.occupation
        }
        if (req.body.employer) {
            req.user.employer = req.body.employer
        }
        if (req.body.streetAddress) {
            req.user.streetAddress = req.body.streetAddress
        }
        if (req.body.cityStateZip) {
            req.user.cityStateZip = req.body.cityStateZip
        }

        var now = Date.now() / 1000
        req.user.modified = now

        redis.hset(redisKeys.users, req.user.iden, JSON.stringify(req.user), function(err, reply) {
            if (err) {
                res.sendStatus(500)
                console.error(err)
            } else {
                res.sendStatus(200)
            }
        })
    })

    app.post('/v1/set-card', function(req, res) {
        if (!req.body.cardToken) {
            res.sendStatus(400)
            return
        }

        redis.hget(redisKeys.userIdenToStripeCustomerId, req.user.iden, function(err, reply) {
            if (err) {
                res.sendStatus(500)
                console.error(err)
            } else if (reply) {
                stripe.customers.update(reply, {
                    'source': req.body.cardToken
                }, function(err, customer) {
                    if (err) {
                        res.sendStatus(400)
                        console.error(err)
                    } else {
                        res.sendStatus(200)
                    }
                })
            } else {
                stripe.customers.create({
                    'source': req.body.cardToken,
                    'metadata': {
                        'userIden': req.user.iden
                    }
                }, function(err, customer) {
                    redis.hset(redisKeys.userIdenToStripeCustomerId, req.user.iden, customer.id, function(err, reply) {
                        if (err) {
                            res.sendStatus(400)
                            console.error(err)
                        } else {
                            res.sendStatus(200)
                        }
                    })
                })
            }
        })
    })

    app.post('/v1/create-contribution', function(req, res) {
        if (!req.body.eventIden || !req.body.pacIden || !req.body.amount) {
            res.sendStatus(400)
            return
        }

        var tasks = []
        tasks.push(function(callback) {
            redis.hget(redisKeys.userIdenToStripeCustomerId, req.user.iden, function(err, reply) {
                callback(err, reply)
            })
        })
        tasks.push(function(callback) {
            entities.getEvent(req.body.eventIden, function(err, event) {
                callback(err, event)
            })
        })
        tasks.push(function(callback) {
            entities.getPac(req.body.pacIden, function(err, pac) {
                callback(err, pac)
            })
        })

        async.parallel(tasks, function(err, results) {
            if (err) {
                res.sendStatus(500)
                console.error(err)
            } else {
                var customerId = results[0]
                if (!customerId) {
                    res.sendStatus(400)
                    return
                }

                var event = results[1]
                if (!event) {
                    res.sendStatus(400)
                    return
                }

                var pac = results[2]
                if (!pac) {
                    res.sendStatus(400)
                    return
                }

                var support
                if (event.supportPacs.indexOf(pac.iden) != -1) {
                    support = true
                } else if (event.opposePacs.indexOf(pac.iden) != -1) {
                    support = false
                } else {
                    res.sendStatus(400)
                    return
                }

                stripe.charges.create({
                    'amount': req.body.amount * 100, // Amount is in dollars, Strip API is in cents
                    'currency': 'usd',
                    'customer': customerId,
                    'metadata': {
                        'eventIden': event.iden,
                        'pacIden': pac.iden,
                        'support': support
                    }
                }, function(err, charge) {
                    if (err) {
                        console.error(err)
                        res.sendStatus(400)
                    } else {
                        var now = Date.now() / 1000

                        var contribution = {
                            'iden': generateIden(),
                            'created': now,
                            'modified': now,
                            'chargeId': charge.id,
                            'amount': req.body.amount,
                            'event': event.iden,
                            'pac': pac.iden,
                            'support': support
                        }

                        var tasks = []
                        tasks.push(function(callback) {
                            redis.hset(redisKeys.contributions, contribution.iden, JSON.stringify(contribution), function(err, reply) {
                                if (err) {
                                    console.error(err)
                                }
                                callback()
                            })
                        })
                        tasks.push(function(callback) {
                            redis.lpush(redisKeys.userReverseChronologicalContributions(req.user.iden), contribution.iden, function(err, reply) {
                                if (err) {
                                    console.error(err)
                                }
                                callback()
                            })
                        })
                        tasks.push(function(callback) {
                            var key = support ? 'support' : 'oppose'
                            redis.hincrby(redisKeys.eventContributionTotals(event.iden), key, contribution.amount, function(err, reply) {
                                if (err) {
                                    console.error(err)
                                }
                                callback()
                            })
                        })
                        tasks.push(function(callback) {
                            var key = support ? 'support' : 'oppose'
                            redis.hincrby(redisKeys.politicianContributionTotals(event.politician), key, contribution.amount, function(err, reply) {
                                if (err) {
                                    console.error(err)
                                }
                                callback()
                            })
                        })
                        tasks.push(function(callback) {
                            redis.incrby(redisKeys.contributionsSum, contribution.amount, function(err, reply) {
                                if (err) {
                                    console.error(err)
                                }
                                callback()
                            })
                        })
                        tasks.push(function(callback) {
                            redis.incrby(redisKeys.userContributionsSum(req.user.iden), contribution.amount, function(err, reply) {
                                if (err) {
                                    console.error(err)
                                }
                                callback()
                            })
                        })

                        async.series(tasks, function(err, results) {
                            res.sendStatus(200)
                        })
                    }
                })
            }
        })
    })
}

var generateIden = function() {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
}

var getFacebookUserInfo = function(facebookToken, callback) {
    var appIdAndSecret = '980119325404337|55224c68bd1df55da4bcac85dc879906'
    var url = 'https://graph.facebook.com/v2.5/debug_token?access_token=' + appIdAndSecret + '&input_token=' + facebookToken
    request.get(url, function(err, res, body) {
        if (res.statusCode == 200) {
            if (JSON.parse(body).data.is_valid) {
                var url = 'https://graph.facebook.com/v2.5/me?fields=id,name,email&access_token=' + facebookToken
                request.get(url, function(err, res, body) {
                    if (res.statusCode == 200) {
                        callback(true, JSON.parse(body))
                    } else {
                        callback(false)
                    }
                })
                return
            }
        }
        callback(false)
    })
}
