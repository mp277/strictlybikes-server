const Sequelize = require('sequelize');
const definitions = require('../db/models/index');
const badgeList = require('./badgeList');
const userMet = require('./userMetrics');

const { DB_NAME, DB_USER, DB_USER_PASSWORD } = process.env;

const { Op } = Sequelize;
const connection = new Sequelize(DB_NAME, DB_USER, DB_USER_PASSWORD, {
  host: process.env.DB_HOST,
  dialect: 'postgres',
  logging: false,
});

connection
  .authenticate()
  .then(() => {
    console.log('Connection has been established successfully.');
  })
  .catch((err) => {
    console.error('Unable to connect to the database:', err);
  });
const models = {};
const names = Object.keys(definitions);
names.forEach((name) => {
  models[name] = connection.define(name, definitions[name]);
  connection.sync();
});

const {
  users, games, markers, usermarkers, usergames, badges, userbadges, metrics, usermetrics,
} = models;

users.hasMany(usergames);
games.hasMany(usergames);
games.belongsTo(users);
markers.belongsTo(games);
users.hasMany(usermarkers);
markers.hasMany(usermarkers);
games.hasMany(usermarkers);
users.hasMany(usermetrics);
metrics.hasMany(usermetrics);
badges.belongsTo(metrics);
users.hasMany(userbadges);
badges.hasMany(userbadges);

// Only need to run once to populate database with badges.

userMet.forEach(async (metric) => {
  try {
    const [currentMetric] = await metrics.findCreateFind({ where: metric });
    const { id: metricId, name } = currentMetric;
    const badgeArray = badgeList[name];
    badgeArray.forEach((badge) => {
      badge.metricId = metricId;
      badges.findCreateFind({ where: badge });
    });
  } catch (err) {
    console.error(`Failed to create metric and badge row ${err}`);
  }
});

games.updateMetrics = async (game) => {
  try {
    const allMetrics = await metrics.findAll();
    const metricsId = allMetrics.reduce((acc, metric) => {
      acc[metric.name] = metric.id;
      return acc;
    }, {});
    const playerGames = await usergames.findAll({ where: { gameId: game.id } });
    playerGames.forEach(async (player) => {
      try {
        const [playedGames] = await usermetrics.findCreateFind({
          where: {
            userId: player.userId,
            metricId: metricsId.gamesPlayed,
          },
        });
        await playedGames.increment('value');
        const gameBadge = await badges.findOne({
          where: {
            metricId: metricsId.gamesPlayed,
            goal: playedGames.value,
          },
        });
        if (gameBadge) {
          userbadges.create({
            userId: player.userId,
            badgeId: gameBadge.id,
          });
        }
        const [winStreak] = await usermetrics.findCreateFind({
          where: {
            userId: player.userId,
            metricId: metricsId.winStreak,
          },
        });
        if (player.markerCount === game.markerLimit) {
          const wonGames = await usermetrics.findCreateFind({
            where: {
              userId: player.userId,
              metricId: metricsId.wins,
            },
          });
          await wonGames.increment();
          const wonBadge = await badges.findOne({
            where: {
              metricId: metricsId.wins,
              goal: wonGames.value,
            },
          });
          if (wonBadge) {
            userbadges.create({
              where: {
                userId: player.userId,
                badgeId: wonBadge.id,
              },
            });
          }
          await winStreak.increment();
          const streakBadge = await badges.findOne({
            where: {
              metricId: metricsId.winStreak,
              goal: winStreak.value,
            },
          });
          if (streakBadge) {
            userbadges.create({
              where: {
                userId: player.userId,
                badgeId: wonBadge.id,
              },
            });
          }
        } else {
          winStreak.update({ value: 0 });
        }
      } catch (err) {
        console.error(err);
      }
    });
  } catch (err) {
    console.error(err);
  }
};


module.exports.connection = connection;
module.exports.models = models;
module.exports.Sequelize = Sequelize;
