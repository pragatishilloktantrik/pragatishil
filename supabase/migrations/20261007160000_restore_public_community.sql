-- The website's Community navigation expects this public discussion channel.
INSERT INTO public.discussion_channels(name,name_ne,slug,description,visibility,access_type,allow_anonymous_posts,
    min_role_to_post,min_role_to_create_threads,min_role_to_comment,min_role_to_vote,icon_emoji)
VALUES ('Khulla Manch','खुल्ला मञ्च','khulla-manch','Public community discussions / सार्वजनिक सामुदायिक छलफल',
    'public','public',false,'member','member','member','member','💬')
ON CONFLICT (slug) DO NOTHING;
