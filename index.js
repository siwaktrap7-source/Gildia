
const { Client, GatewayIntentBits, Collection, Partials, Events } = require('discord.js');
const path = require('path');
require('./keepAlive'); // opcjonalny web server (Railway i tak trzyma 24/7)

const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.error('[FATAL] Missing TOKEN env var.');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel]
});

const guildCmd = require('./commands/guild');
client.commands = new Collection();
client.commands.set(guildCmd.data.name, guildCmd);

client.once(Events.ClientReady, async (c) => {
  console.log(`[BOT] Zalogowano jako ${c.user.tag}`);
  try {
    await c.application.commands.set([ guildCmd.data ]);
    console.log('[BOT] Zarejestrowano /gildia');
  } catch (e) {
    console.error('[BOT] Nie udało się zarejestrować komend', e);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd) return;
      await cmd.execute(interaction);
      return;
    }

    if (interaction.isButton()) {
      const cmd = client.commands.get('gildia');
      if (cmd?.handleButton) return cmd.handleButton(interaction);
    }

    if (interaction.isAnySelectMenu()) {
      const cmd = client.commands.get('gildia');
      if (cmd?.handleSelect) return cmd.handleSelect(interaction);
    }

    if (interaction.isModalSubmit()) {
      const cmd = client.commands.get('gildia');
      if (cmd?.handleModal) return cmd.handleModal(interaction);
    }
  } catch (e) {
    console.error('[Interaction Error]', e);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: 'Wystąpił błąd. Spróbuj ponownie później.', components: [], embeds: [] }).catch(()=>{});
    } else {
      await interaction.reply({ content: 'Wystąpił błąd. Spróbuj ponownie później.', ephemeral: true }).catch(()=>{});
    }
  }
});

client.login(TOKEN);
