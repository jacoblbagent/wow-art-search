/**
 * Feature flags.
 *
 * CATALOGUE gates the pre-loaded index: the 2,090 artworks harvested from the
 * Warcraft Wiki that ship with the app, the plain search box, the collection
 * chips, and the server-side index tools (search_index, artist_leaderboard,
 * find_artists). The agent itself does not depend on any of it — it reaches the
 * live wiki through search_wiki / get_file_details / wiki_article.
 *
 * It is OFF: the app is being built as an agent-first tool, so everything
 * behaves as though the bundled catalogue does not exist. Set it back to true
 * and the catalogue code paths come back exactly as they were.
 *
 * Shared by the client and the server so the two can never disagree about
 * whether the catalogue exists.
 */
export const CATALOGUE_ENABLED = false
