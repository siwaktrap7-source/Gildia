const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const dataFile = './data.json';

function loadData() {
    if (!fs.existsSync(dataFile)) return {};
    return JSON.parse(fs.readFileSync(dataFile));
}

function saveData(data) {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('guild')
        .setDescription('System gildii')
        .addSubcommand(sub =>
            sub.setName('create')
                .setDescription('Stwórz nową gildię')
                .addStringOption(opt =>
                    opt.setName('name').setDescription('Nazwa gildii').setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('info').setDescription('Zobacz informacje o swojej gildii')),
    async execute(interaction) {
        const userId = interaction.user.id;
        const data = loadData();

        if (interaction.options.getSubcommand() === 'create') {
            const name = interaction.options.getString('name');
            if (data[userId]) {
                await interaction.reply('Masz już gildię!');
                return;
            }
            data[userId] = { name: name, level: 1, coins: 0 };
            saveData(data);
            await interaction.reply(`Stworzyłeś gildię **${name}**!`);
        }

        if (interaction.options.getSubcommand() === 'info') {
            const guild = data[userId];
            if (!guild) {
                await interaction.reply('Nie masz jeszcze gildii!');
                return;
            }
            await interaction.reply(`Twoja gildia: **${guild.name}** | Level: ${guild.level} | Coins: ${guild.coins}`);
        }
    }
};