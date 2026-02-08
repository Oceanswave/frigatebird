#!/usr/bin/env node
import { Command } from 'commander';
import {
  whoami,
  readTweet,
  searchTweets,
  listTimeline,
  postTweet,
  thread,
  replies,
  mentions,
  userTweets,
  home,
  bookmarks,
  follow,
  unfollow,
  lists,
  reply,
  like,
  retweet,
} from './commands.js';

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

program
  .command('thread')
  .description('Read a tweet thread/conversation')
  .argument('<urlOrId>', 'Tweet URL or ID')
  .action(thread);

program
  .command('replies')
  .description('Get replies to a tweet')
  .argument('<urlOrId>', 'Tweet URL or ID')
  .action(replies);

program
  .command('mentions')
  .description('Get your mentions')
  .action(mentions);

program
  .command('user-tweets')
  .description("Get a user's tweets")
  .argument('<handle>', 'Username (with or without @)')
  .action(userTweets);

program
  .command('home')
  .description('Read your home timeline')
  .action(home);

program
  .command('bookmarks')
  .description('Get your bookmarks')
  .action(bookmarks);

program
  .command('follow')
  .description('Follow a user')
  .argument('<handle>', 'Username (with or without @)')
  .action(follow);

program
  .command('unfollow')
  .description('Unfollow a user')
  .argument('<handle>', 'Username (with or without @)')
  .action(unfollow);

program
  .command('lists')
  .description('Get your lists')
  .action(lists);

program
  .command('reply')
  .description('Reply to a tweet')
  .argument('<urlOrId>', 'Tweet URL or ID')
  .argument('<text>', 'Reply text')
  .action(reply);

program
  .command('like')
  .description('Like a tweet')
  .argument('<urlOrId>', 'Tweet URL or ID')
  .action(like);

program
  .command('retweet')
  .description('Retweet/repost a tweet')
  .argument('<urlOrId>', 'Tweet URL or ID')
  .action(retweet);

program.parse();
