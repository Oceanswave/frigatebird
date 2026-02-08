#!/usr/bin/env node
import { Command } from 'commander';
import { whoami, readTweet, searchTweets, listTimeline, postTweet } from './commands.js';

const program = new Command();

program
  .name('frigatebird')
  .description('Playwright-based CLI for X/Twitter')
  .version('0.1.0');

program
  .command('whoami')
  .description('Get logged-in user info')
  .action(whoami);

program
  .command('read')
  .description('Read a single tweet')
  .argument('<urlOrId>', 'Tweet URL or ID')
  .action(readTweet);

program
  .command('search')
  .description('Search tweets')
  .argument('<query>', 'Search query')
  .action(searchTweets);

program
  .command('list-timeline')
  .description("Read a list's timeline")
  .argument('<listId>', 'List ID')
  .action(listTimeline);

program
  .command('post')
  .description('Post a tweet')
  .argument('<text>', 'Tweet text')
  .action(postTweet);

program.parse();
