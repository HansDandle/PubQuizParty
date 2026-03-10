SELECT gs.id as session_id, gs.room_code, st.team_id, t.team_name, st.score, st.correct_count
FROM game_sessions gs
JOIN session_teams st ON st.game_session_id = gs.id
JOIN teams t ON t.id = st.team_id
WHERE gs.status = 'active'
ORDER BY st.score DESC;
