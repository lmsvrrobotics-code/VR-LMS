const bcrypt = require('bcryptjs');
const { sequelize, User } = require('../models');

(async () => {
    try {
        await sequelize.authenticate();
        const email = process.argv[2] || 'vrroot@vrroboticsacademy.com';
        const password = process.argv[3] || 'VrRoot@2026';
        const name = process.argv[4] || 'VR Robotics Root Admin';

        const existing = await User.findOne({ where: { email } });
        if (existing) {
            console.log(`User ${email} already exists (id=${existing.id}, role=${existing.role}). Updating password.`);
            await existing.update({ password: await bcrypt.hash(password, 10), role: 'admin', status: 1 });
        } else {
            // unique_id is NOT NULL in lms_admin.users; generate it via the DB
            // helper so it follows the platform's ID convention (see migration 09).
            const [[{ get_next_user_id: uniqueId }]] = await sequelize.query(
                'SELECT lms_admin.get_next_user_id(:name) AS get_next_user_id',
                { replacements: { name } }
            );
            const created = await User.create({
                name, email, role: 'admin', status: 1,
                unique_id: uniqueId,
                password: await bcrypt.hash(password, 10),
            });
            console.log(`Created admin id=${created.id} email=${email} unique_id=${uniqueId}`);
        }
        console.log(`Login with: email=${email} password=${password}`);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
