
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const db = require('../util/db');

function sanitizeName(name) {
  return name.replace(/\s+/g, ' ').trim().slice(0, 15);
}

function save(mutator) {
  const guilds = db.read();
  const result = mutator(guilds) || guilds;
  db.write(result);
  return result;
}

function getState() {
  return db.read();
}

function findGuildByMember(userId) {
  const guilds = db.read();
  return db.findGuildByMember(guilds, userId);
}

function renderGuildEmbed(guild) {
  return new EmbedBuilder()
    .setTitle(`🏰 ${guild.name}`)
    .setDescription(
      `**Właściciel:** <@${guild.owner}>\n` +
      `**Zastępcy:** ${guild.deputies.length ? guild.deputies.map(id => `<@${id}>`).join(', ') : 'brak'}\n` +
      `**Członkowie:** ${guild.members.length} (${guild.members.map(id => `<@${id}>`).join(', ')})\n` +
      `**Podania oczekujące:** ${guild.applications.length}`
    )
    .setColor('Blue');
}

function generateMemberRows(guild, viewerId) {
  const rows = [];
  const isOwner = guild.owner === viewerId;

  const chunk = (arr, size) => arr.reduce((acc, _, i) => (i % size ? acc : [...acc, arr.slice(i, i + size)]), []);
  const manageableMembers = guild.members.filter(m => m !== guild.owner);
  const chunks = chunk(manageableMembers, 2);

  chunks.forEach(group => {
    const row = new ActionRowBuilder();
    group.forEach(memberId => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`promote:${memberId}`)
          .setLabel(guild.deputies.includes(memberId) ? `⭐ Zastępca` : `⭐ Awansuj <@${memberId}>`)
          .setStyle(guild.deputies.includes(memberId) ? ButtonStyle.Secondary : ButtonStyle.Success)
          .setDisabled(!isOwner || guild.deputies.includes(memberId)),
        new ButtonBuilder()
          .setCustomId(`kick:${memberId}`)
          .setLabel(`❌ Wyrzuć <@${memberId}>`)
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!isOwner)
      );
    });
    rows.push(row);
  });

  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('apps:open')
      .setLabel(`📨 Podania (${guild.applications.length})`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!(isOwner || guild.deputies.includes(viewerId))),
    new ButtonBuilder()
      .setCustomId('leave:me')
      .setLabel('🚪 Opuść gildię')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(guild.owner === viewerId && guild.members.length > 1)
  );
  rows.push(actions);

  return rows;
}

async function showGuildPanel(interaction, guild) {
  const embed = renderGuildEmbed(guild);
  const rows = generateMemberRows(guild, interaction.user.id);
  if (interaction.replied || interaction.deferred) {
    return interaction.editReply({ embeds: [embed], components: rows });
  }
  return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gildia')
    .setDescription('Panel gildii: zakładanie, dołączanie, zarządzanie'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const guild = findGuildByMember(userId);

    if (!guild) {
      const startRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('create:open').setLabel('🏰 Załóż gildię').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('apply:open').setLabel('✉️ Dołącz do gildii').setStyle(ButtonStyle.Primary)
      );
      return interaction.reply({ content: 'Nie jesteś w żadnej gildii. Wybierz akcję:', components: [startRow], ephemeral: true });
    }

    return showGuildPanel(interaction, guild);
  },

  async handleButton(interaction) {
    const [action, payload] = interaction.customId.split(':');
    const userId = interaction.user.id;

    if (interaction.customId === 'create:open') {
      const modal = new ModalBuilder()
        .setCustomId('create:modal')
        .setTitle('Załóż gildię');

      const nameInput = new TextInputBuilder()
        .setCustomId('create:name')
        .setLabel('Nazwa gildii (max 15 znaków)')
        .setPlaceholder('Np. Smoki')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(15)
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(nameInput);
      modal.addComponents(row);

      return interaction.showModal(modal);
    }

    if (interaction.customId === 'apply:open') {
      const guilds = getState();
      const available = guilds.filter(g =>
        !g.members.includes(userId) &&
        !g.deputies.includes(userId) &&
        g.owner !== userId
      );

      if (!available.length) {
        return interaction.reply({ content: 'Brak dostępnych gildii do dołączenia.', ephemeral: true });
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId('apply:select')
        .setPlaceholder('Wybierz gildię do której chcesz zaaplikować')
        .addOptions(available.slice(0, 25).map(g => ({
          label: g.name,
          description: `Członkowie: ${g.members.length}`,
          value: g.name
        })));

      const row = new ActionRowBuilder().addComponents(menu);
      return interaction.reply({ content: 'Wybierz gildię z listy:', components: [row], ephemeral: true });
    }

    if (action === 'leave' && payload === 'me') {
      const updated = save(guilds => {
        const guild = db.findGuildByMember(guilds, userId);
        if (!guild) return guilds;
        if (guild.owner === userId && guild.members.length > 1) return guilds;
        guild.members = guild.members.filter(m => m !== userId);
        guild.deputies = guild.deputies.filter(m => m !== userId);
        if (guild.members.length === 0) {
          return guilds.filter(g => g !== guild);
        }
        return guilds;
      });

      await interaction.update({ content: 'Opuściłeś gildię.', embeds: [], components: [] });
      return;
    }

    if (interaction.customId === 'apps:open') {
      const guilds = getState();
      const g = db.findGuildByMember(guilds, userId);
      if (!g) return interaction.reply({ content: 'Nie znaleziono gildii.', ephemeral: true });

      const canManageApps = g.owner === userId || g.deputies.includes(userId);
      if (!canManageApps) return interaction.reply({ content: 'Nie masz uprawnień do przeglądania podań.', ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle(`📨 Podania do gildii: ${g.name}`)
        .setDescription(g.applications.length
          ? g.applications.map(a => `• <@${a}>`).join('\n')
          : 'Brak podań do rozpatrzenia.')
        .setColor('Purple');

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('apps:accept').setLabel('✅ Akceptuj pierwsze').setStyle(ButtonStyle.Success).setDisabled(!g.applications.length),
        new ButtonBuilder().setCustomId('apps:decline').setLabel('❌ Odrzuć pierwsze').setStyle(ButtonStyle.Danger).setDisabled(!g.applications.length),
        new ButtonBuilder().setCustomId('apps:back').setLabel('↩️ Wróć').setStyle(ButtonStyle.Secondary)
      );

      if (interaction.replied || interaction.deferred) {
        return interaction.editReply({ embeds: [embed], components: [row] });
      }
      return interaction.update({ embeds: [embed], components: [row] });
    }

    if (interaction.customId === 'apps:accept' || interaction.customId === 'apps:decline') {
      const isAccept = interaction.customId.endsWith('accept');
      const guilds = getState();
      const g = db.findGuildByMember(guilds, userId);
      if (!g) return interaction.reply({ content: 'Nie znaleziono gildii.', ephemeral: true });
      const canManageApps = g.owner === userId || g.deputies.includes(userId);
      if (!canManageApps) return interaction.reply({ content: 'Brak uprawnień.', ephemeral: true });
      if (!g.applications.length) return interaction.reply({ content: 'Brak podań.', ephemeral: true });

      const applicant = g.applications.shift();
      if (isAccept) {
        if (!g.members.includes(applicant)) g.members.push(applicant);
      }
      save(_ => guilds);

      const embed = new EmbedBuilder()
        .setTitle(`📨 Podania do gildii: ${g.name}`)
        .setDescription(g.applications.length
          ? g.applications.map(a => `• <@${a}>`).join('\n')
          : 'Brak podań do rozpatrzenia.')
        .setColor('Purple');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('apps:accept').setLabel('✅ Akceptuj pierwsze').setStyle(ButtonStyle.Success).setDisabled(!g.applications.length),
        new ButtonBuilder().setCustomId('apps:decline').setLabel('❌ Odrzuć pierwsze').setStyle(ButtonStyle.Danger).setDisabled(!g.applications.length),
        new ButtonBuilder().setCustomId('apps:back').setLabel('↩️ Wróć').setStyle(ButtonStyle.Secondary)
      );
      return interaction.update({ embeds: [embed], components: [row] });
    }

    if (interaction.customId === 'apps:back') {
      const g = findGuildByMember(userId);
      return showGuildPanel(interaction, g);
    }

    if (action === 'promote') {
      const targetId = payload;
      const guilds = getState();
      const g = db.findGuildByMember(guilds, userId);
      if (!g) return;
      if (g.owner !== userId) return interaction.reply({ content: 'Tylko właściciel może awansować.', ephemeral: true });

      if (!g.members.includes(targetId)) return interaction.reply({ content: 'Ten użytkownik nie jest w gildii.', ephemeral: true });
      if (!g.deputies.includes(targetId)) g.deputies.push(targetId);
      save(_ => guilds);

      return showGuildPanel(interaction, g);
    }

    if (action === 'kick') {
      const targetId = payload;
      const guilds = getState();
      const g = db.findGuildByMember(guilds, userId);
      if (!g) return;
      if (g.owner !== userId) return interaction.reply({ content: 'Tylko właściciel może wyrzucać.', ephemeral: true });

      g.members = g.members.filter(m => m !== targetId);
      g.deputies = g.deputies.filter(m => m !== targetId);
      save(_ => guilds);
      return showGuildPanel(interaction, g);
    }
  },

  async handleModal(interaction) {
    if (interaction.customId === 'create:modal') {
      const rawName = interaction.fields.getTextInputValue('create:name');
      const name = sanitizeName(rawName);
      if (!name) return interaction.reply({ content: 'Nieprawidłowa nazwa.', ephemeral: true });

      if (findGuildByMember(interaction.user.id)) {
        return interaction.reply({ content: 'Jesteś już w gildii.', ephemeral: true });
      }

      const exists = db.findGuildByName(db.read(), name);
      if (exists) return interaction.reply({ content: 'Gildia o takiej nazwie już istnieje.', ephemeral: true });

      save(guilds => {
        guilds.push({
          name,
          owner: interaction.user.id,
          deputies: [],
          members: [interaction.user.id],
          applications: []
        });
        return guilds;
      });

      return interaction.reply({ content: `🏰 Utworzono gildię **${name}**!`, ephemeral: true });
    }
  },

  async handleSelect(interaction) {
    if (interaction.customId === 'apply:select') {
      const [value] = interaction.values;
      const name = value;
      const guilds = getState();
      const g = guilds.find(x => x.name === name);
      if (!g) return interaction.reply({ content: 'Nie znaleziono gildii.', ephemeral: true });

      if (g.owner === interaction.user.id || g.members.includes(interaction.user.id) || g.deputies.includes(interaction.user.id)) {
        return interaction.reply({ content: 'Jesteś już w gildii.', ephemeral: true });
      }

      if (!g.applications.includes(interaction.user.id)) {
        g.applications.push(interaction.user.id);
        save(_ => guilds);
      }

      return interaction.update({ content: `📨 Złożono podanie do gildii **${g.name}**. Poczekaj na akceptację.`, components: [] });
    }
  }
};
