import kleur from "kleur";
import type {
	CollectionResult,
	ListInfo,
	MutationResult,
	NewsItem,
	QueryIdsResult,
	Tweet,
	UserProfile,
	UserSummary,
} from "./types.js";

interface OutputConfig {
	plain?: boolean;
	color?: boolean;
	emoji?: boolean;
}

function paint(enabled: boolean) {
	if (!enabled) {
		return {
			title: (v: string) => v,
			key: (v: string) => v,
			muted: (v: string) => v,
			success: (v: string) => v,
			warning: (v: string) => v,
			error: (v: string) => v,
		};
	}

	return {
		title: (v: string) => kleur.bold().cyan(v),
		key: (v: string) => kleur.bold(v),
		muted: (v: string) => kleur.gray(v),
		success: (v: string) => kleur.green(v),
		warning: (v: string) => kleur.yellow(v),
		error: (v: string) => kleur.red(v),
	};
}

export class Output {
	private readonly cfg: OutputConfig;
	private readonly c: ReturnType<typeof paint>;

	constructor(cfg: OutputConfig) {
		this.cfg = cfg;
		this.c = paint((cfg.plain ? false : cfg.color) !== false);
	}

	warn(message: string): void {
		console.warn(this.c.warning(message));
	}

	info(message: string): void {
		console.log(message);
	}

	error(message: string): void {
		console.error(this.c.error(message));
	}

	json(value: unknown): void {
		console.log(JSON.stringify(value, null, 2));
	}

	mutation(result: MutationResult): void {
		const icon = this.cfg.emoji === false ? "" : result.ok ? "✓ " : "✗ ";
		const painter = result.ok ? this.c.success : this.c.error;
		console.log(painter(`${icon}${result.message}`.trim()));
	}

	tweets(result: CollectionResult<Tweet>): void {
		if (result.items.length === 0) {
			console.log(this.c.muted("No tweets found."));
			return;
		}

		for (const tweet of result.items) {
			const headerParts: string[] = [];
			if (tweet.createdAt) headerParts.push(tweet.createdAt);
			if (tweet.authorName || tweet.authorHandle) {
				const identity = [
					tweet.authorName,
					tweet.authorHandle ? `(@${tweet.authorHandle})` : "",
				]
					.filter(Boolean)
					.join(" ");
				headerParts.push(identity.trim());
			}
			if (tweet.id) headerParts.push(`#${tweet.id}`);

			console.log(this.c.title(headerParts.join(" • ")));
			console.log(tweet.text || "[media-only tweet]");
			console.log(this.c.muted(tweet.url));
			console.log("");
		}

		if (result.nextCursor) {
			console.log(this.c.muted(`next_cursor: ${result.nextCursor}`));
		}
	}

	users(result: CollectionResult<UserSummary>): void {
		if (result.items.length === 0) {
			console.log(this.c.muted("No users found."));
			return;
		}

		for (const user of result.items) {
			const identity = [user.name, user.handle ? `(@${user.handle})` : ""]
				.filter(Boolean)
				.join(" ");
			console.log(this.c.title(identity || user.url || "Unknown user"));
			if (user.bio) console.log(user.bio);
			if (user.url) console.log(this.c.muted(user.url));
			console.log("");
		}
	}

	lists(result: CollectionResult<ListInfo>): void {
		if (result.items.length === 0) {
			console.log(this.c.muted("No lists found."));
			return;
		}

		for (const item of result.items) {
			const stats = [
				item.memberCount !== undefined ? `${item.memberCount} members` : null,
				item.subscriberCount !== undefined
					? `${item.subscriberCount} subscribers`
					: null,
			]
				.filter(Boolean)
				.join(" • ");

			console.log(this.c.title(`${item.name} (${item.id})`));
			if (item.description) console.log(item.description);
			if (stats) console.log(this.c.muted(stats));
			console.log(this.c.muted(item.url));
			console.log("");
		}
	}

	profile(profile: UserProfile): void {
		console.log(this.c.title(profile.name || profile.handle || "Unknown user"));
		if (profile.handle)
			console.log(`${this.c.key("Handle")}: @${profile.handle}`);
		if (profile.id) console.log(`${this.c.key("ID")}: ${profile.id}`);
		if (profile.bio) console.log(`${this.c.key("Bio")}: ${profile.bio}`);
		if (profile.location)
			console.log(`${this.c.key("Location")}: ${profile.location}`);
		if (profile.joined)
			console.log(`${this.c.key("Joined")}: ${profile.joined}`);
		if (profile.website)
			console.log(`${this.c.key("Website")}: ${profile.website}`);
		if (profile.verified !== undefined)
			console.log(
				`${this.c.key("Verified")}: ${profile.verified ? "yes" : "no"}`,
			);
		if (profile.accountBasedIn)
			console.log(
				`${this.c.key("Account Based In")}: ${profile.accountBasedIn}`,
			);
		if (profile.source)
			console.log(`${this.c.key("Source")}: ${profile.source}`);
		if (profile.createdCountryAccurate !== undefined)
			console.log(
				`${this.c.key("Created Country Accurate")}: ${
					profile.createdCountryAccurate ? "yes" : "no"
				}`,
			);
		if (profile.locationAccurate !== undefined)
			console.log(
				`${this.c.key("Location Accurate")}: ${
					profile.locationAccurate ? "yes" : "no"
				}`,
			);
		if (profile.learnMoreUrl)
			console.log(`${this.c.key("Learn More")}: ${profile.learnMoreUrl}`);
	}

	news(result: CollectionResult<NewsItem>): void {
		if (result.items.length === 0) {
			console.log(this.c.muted("No news items found."));
			return;
		}

		for (const item of result.items) {
			console.log(this.c.title(`${item.headline} [${item.sourceTab}]`));
			if (item.category) console.log(this.c.muted(item.category));
			if (item.summary) console.log(item.summary);
			if (item.url) console.log(this.c.muted(item.url));
			if (item.relatedTweets && item.relatedTweets.length > 0) {
				console.log(this.c.key("Related Tweets:"));
				for (const tweet of item.relatedTweets) {
					console.log(
						`- ${tweet.authorHandle ? `@${tweet.authorHandle}: ` : ""}${tweet.text}`,
					);
				}
			}
			console.log("");
		}
	}

	queryIds(result: QueryIdsResult): void {
		console.log(this.c.title("Query IDs Compatibility"));
		console.log(`${this.c.key("Backend")}: ${result.mode}`);
		console.log(
			`${this.c.key("Refreshed")}: ${result.refreshed ? "yes" : "no"}`,
		);
		console.log(`${this.c.key("Timestamp")}: ${result.timestamp}`);
		console.log(result.note);
	}
}
