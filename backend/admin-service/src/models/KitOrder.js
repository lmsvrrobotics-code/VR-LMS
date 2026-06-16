const { DataTypes } = require('sequelize');

// Kit orders — one row per purchase attempt by a student. Similar to BookOrder.
// Admin can view all orders and mark them as sent/delivered. status:
//   created → order placed with Razorpay (not paid yet)
//   paid    → payment verified (checkout handler signature OR webhook)
//   failed  → Razorpay reported failure
//   sent    → admin marked the order as sent (physically shipped)
module.exports = (sequelize) => {
    const KitOrder = sequelize.define('KitOrder', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: DataTypes.STRING(64), allowNull: false },
        kit_id: { type: DataTypes.INTEGER, allowNull: false },
        // Amount in the smallest currency unit (paise for INR).
        amount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        currency: { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'INR' },
        status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'created' },
        razorpay_order_id: { type: DataTypes.STRING(64), allowNull: true },
        razorpay_payment_id: { type: DataTypes.STRING(64), allowNull: true },
    }, {
        tableName: 'kit_orders',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            { fields: ['user_id', 'kit_id'] },
            { fields: ['razorpay_order_id'] },
            { fields: ['status'] },
        ],
    });

    KitOrder.associate = (models) => {
        KitOrder.belongsTo(models.Kit, { foreignKey: 'kit_id', as: 'kit' });
    };

    return KitOrder;
};
