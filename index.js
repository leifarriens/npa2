#!/usr/bin/env node

const { Command } = require('commander');
const fs = require('fs');
const Axios = require('axios');
const Table = require('cli-table');
const chalk = require('chalk');
const ora = require('ora');

const VERSION = require('./package.json').version;

const program = new Command();

let spinner;
let pkgJson = null;

program
  .version(VERSION)
  .option('-D, --dev', 'analyse devDependencies')
  .option('-S, --scripts', 'preview package scripts')
  .action((options, command) => {
    const config = {
      dependencies: options.dev ? 'devDependencies' : 'dependencies',
      colored: true,
      docs: true,
      sort: false,
    };

    spinner = ora('starting npa2').start();

    pkgJson = readPackageJson();

    spinner.text = `Analysing ${chalk.bgWhite(chalk.black(pkgJson.name))}`;

    if (!pkgJson[config.dependencies]) {
      spinner.warn(`No ${config.dependencies} found in package.json`);
      process.exit(1);
    }

    if (options.scripts) {
      printScipts(pkgJson['scripts']);
      return;
    }

    fetchPkgInfo(config);
  });

program.parse();

async function printScipts(scripts) {
  const head = [chalk.white('Name'), chalk.white('Script')];
  const table = new Table({ head });

  const yarn = await isUsingYarn();
  const packageManagerCmd = yarn ? 'yarn' : 'npm run';

  spinner.succeed(`Done analysing ${chalk.bgWhite(chalk.black(pkgJson.name))}`);

  for (let key in scripts) {
    const row = [`${packageManagerCmd} ${key}`, scripts[key]];
    table.push(row);
  }

  console.log(table.toString());
}

function fetchPkgInfo(config) {
  const data = Object.keys(pkgJson[config.dependencies]);

  Axios.post('https://api.npms.io/v2/package/mget', data)
    .then((res) => {
      spinner.succeed(
        `Done analysing ${chalk.bgWhite(chalk.black(pkgJson.name))}`
      );
      printTable(res.data, config);
    })
    .catch((err) => {
      spinner.fail(
        `Failed fetching the package info with ${err.response.data.message}`
      );
    });
}

function printTable(data, config) {
  const head = [chalk.white('Package'), chalk.white('Version')];

  if (config.docs) head.push(chalk.white('Details'));

  const table = new Table({ head });

  const sorted = Object.values(data).sort((a, b) => {
    if (!config.sort) return 1;
    return b.score.detail.popularity - a.score.detail.popularity;
  });

  sorted.forEach((entry) => {
    const { name, links, keywords, description } = entry.collected.metadata;

    const installedVersion = pkgJson[config.dependencies][name];

    const checkKeyWords = (tags) => {
      for (let i = 0; i < tags.length; i++) {
        if (keywords.includes(tags[i])) {
          return true;
        }
      }
      return false;
    };

    const coloredName = () => {
      if (!config.colored) return name;

      if (!keywords) return name;

      if (checkKeyWords(['cli', 'terminal'])) {
        return chalk.yellow(name);
      }

      if (checkKeyWords(['react', 'reactjs', 'react-native'])) {
        return chalk.blue(name);
      }

      if (checkKeyWords(['vue', 'vuejs'])) {
        return chalk.green(name);
      }

      if (checkKeyWords(['express', 'expressjs', 'http'])) {
        return chalk.redBright(name);
      }

      if (checkKeyWords(['css', 'styling', 'style'])) {
        return chalk.cyan(name);
      }

      if (checkKeyWords(['utils', 'tools', 'parse', 'database', 'lint'])) {
        return chalk.magenta(name);
      }

      if (checkKeyWords(['test', 'tests'])) {
        return chalk.yellowBright(name);
      }

      return name;
    };

    const row = [coloredName(), truncateToMaxChars(installedVersion, 10)];

    const formatedDescription = truncateSentenceToMaxChars(description, 50);

    if (config.docs)
      row.push(
        `\ ${links.homepage || links.npm} \n ${chalk.italic(
          chalk.gray(formatedDescription)
        )}`
      );

    table.push(row);
  });

  if (config.colored) {
    console.log(
      '\n',
      chalk.bgYellow(chalk.black(' CLI ')),
      chalk.bgBlue(' REACT '),
      chalk.bgGreen(' VUE '),
      chalk.bgRedBright(' HTTP '),
      chalk.bgCyan(chalk.whiteBright(' STYLING ')),
      chalk.bgMagenta(' TOOLS '),
      chalk.bgYellowBright(chalk.black(' TESTS ')),
      chalk.bgWhite(chalk.black(' OTHER '))
    );
  }

  console.log(table.toString());
}

// helpers

function readPackageJson() {
  try {
    const raw = fs.readFileSync('./package.json');
    return JSON.parse(raw);
  } catch (err) {
    spinner.warn('No package.json found.');
    process.exit(1);
  }
}

function truncateToMaxChars(str, length) {
  const array = str.split('');

  if (array.length <= length) {
    return array.join('');
  }

  return array.slice(0, length).join('') + '...';
}

function truncateSentenceToMaxChars(str, length) {
  if (str.length > length) {
    const trunc = str.substring(0, length);
    const words = trunc.split(' ');
    words.pop();

    return words.join(' ') + '...';
  }

  return str;
}

async function isUsingYarn() {
  try {
    await fs.promises.stat('yarn.lock');
    return true;
  } catch (error) {
    return false;
  }
}
