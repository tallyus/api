'use strict';
module.exports = {
  up: function(queryInterface, Sequelize) {
    return queryInterface.createTable('PacEvents', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      support: {
        type: Sequelize.BOOLEAN
      },
      event_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'Events',
          key: 'id'
        },
        onUpdate: 'cascade',
        onDelete: 'cascade'
      },
      pac_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'Pacs',
          key: 'id'
        },
        onUpdate: 'cascade',
        onDelete: 'cascade'
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    }).then(function(results) {
      return queryInterface.addIndex(
        'PacEvents',
        ['event_id'],
        {indexName: 'xi_event_pac_event'}
      )
    }).then(function(results) {
      return queryInterface.addIndex(
        'PacEvents',
        ['pac_id'],
        {indexName: 'xi_pac_pac_event'}
      )
    });
  },
  down: function(queryInterface, Sequelize) {
    return queryInterface.dropTable('PacEvents');
  }
};