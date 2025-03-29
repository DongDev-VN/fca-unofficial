const chalk = require('chalk');
const gradient = require("gradient-string");
const themes = [
  'blue',
  'dream2',
  'dream',
  'test',
  'fiery',
  'rainbow',
  'pastel',
  'cristal',
  'red',
  'aqua',
  'pink',
  'retro',
  'sunlight',
  'teen',
  'summer',
  'flower',
  'ghost',
  'hacker'
];
const theme = themes[Math.floor(Math.random() * themes.length)];
let co;
let error;
if (theme.toLowerCase() === 'blue') {
  co = gradient([{ color: "#1affa3", pos: 0.2 }, { color: "cyan", pos: 0.4 }, { color: "pink", pos: 0.6 }, { color: "cyan", pos: 0.8 }, { color: '#1affa3', pos: 1 }]);
  error = chalk.red.bold;
} else if (theme == "dream2") {
  cra = gradient("blue", "pink")
  co = gradient("#a200ff", "#21b5ff", "#a200ff")
} else if (theme.toLowerCase() === 'dream') {
  co = gradient([{ color: "blue", pos: 0.2 }, { color: "pink", pos: 0.3 }, { color: "gold", pos: 0.6 }, { color: "pink", pos: 0.8 }, { color: "blue", pos: 1 }]);
  error = chalk.red.bold;
} else if (theme.toLowerCase() === 'fiery') {
  co = gradient("#fc2803", "#fc6f03", "#fcba03");
  error = chalk.red.bold;
} else if (theme.toLowerCase() === 'rainbow') {
  co = gradient.rainbow
  error = chalk.red.bold;
} else if (theme.toLowerCase() === 'pastel') {
  co = gradient.pastel
  error = chalk.red.bold;
} else if (theme.toLowerCase() === 'cristal') {
  co = gradient.cristal
  error = chalk.red.bold;
} else if (theme.toLowerCase() === 'red') {
  co = gradient("red", "orange");
  error = chalk.red.bold;
} else if (theme.toLowerCase() === 'aqua') {
  co = gradient("#0030ff", "#4e6cf2");
  error = chalk.blueBright;
} else if (theme.toLowerCase() === 'pink') {
  cra = gradient('purple', 'pink');
  co = gradient("#d94fff", "purple");
} else if (theme.toLowerCase() === 'retro') {
  cra = gradient("#d94fff", "purple");
  co = gradient.retro;
} else if (theme.toLowerCase() === 'sunlight') {
  cra = gradient("#f5bd31", "#f5e131");
  co = gradient("orange", "#ffff00", "#ffe600");
} else if (theme.toLowerCase() === 'teen') {
  cra = gradient("#00a9c7", "#853858", "#853858", "#00a9c7");
  co = gradient.teen;
} else if (theme.toLowerCase() === 'summer') {
  cra = gradient("#fcff4d", "#4de1ff");
  co = gradient.summer;
} else if (theme.toLowerCase() === 'flower') {
  cra = gradient("blue", "purple", "yellow", "#81ff6e");
  co = gradient.pastel;
} else if (theme.toLowerCase() === 'ghost') {
  cra = gradient("#0a658a", "#0a7f8a", "#0db5aa");
  co = gradient.mind;
} else if (theme === 'hacker') {
  cra = chalk.hex('#4be813');
  co = gradient('#47a127', '#0eed19', '#27f231');
} else {
  co = gradient("#243aff", "#4687f0", "#5800d4");
  error = chalk.red.bold;
}
module.exports = (text, type) => {
  switch (type) {
    case "warn":
      process.stderr.write(co(`\r[ FCA-WARN ] > ${text}`) + '\n');
      break;
    case "error":
      process.stderr.write(chalk.bold.hex("#ff0000").bold(`\r[ FCA-ERROR ]`) + ` > ${text}` + '\n');
      break;
    case "info":
      process.stderr.write(chalk.bold(co(`\r[ FCA-UNO ] > ${text}`) + '\n'));
      break;
    default:
      process.stderr.write(chalk.bold(co(`\r${String(type).toUpperCase()} ${text}`) + '\n'));
      break;
  }
};