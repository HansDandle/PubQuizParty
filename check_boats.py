import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv('.env.local')
supabase = create_client(
    os.getenv('NEXT_PUBLIC_SUPABASE_URL'),
    os.getenv('SUPABASE_SERVICE_ROLE_KEY')
)

# Count Transportation questions
result = supabase.table('questions').select('*', count='exact').ilike('category', '%transport%').limit(1).execute()
print(f'Transportation questions: {result.count}')

# Check for boat/ship/sail in question text
boat_result = supabase.table('questions').select('*', count='exact').or_('question_text.ilike.%boat%,question_text.ilike.%ship%,question_text.ilike.%sail%').limit(1).execute()
print(f'Boat/ship/sail questions: {boat_result.count}')

# Show sample boat questions
boat_sample = supabase.table('questions').select('question_text, category').or_('question_text.ilike.%boat%,question_text.ilike.%ship%,question_text.ilike.%sail%').limit(5).execute()
print('\nSample boat/ship/sailing questions:')
for q in boat_sample.data:
    text = q['question_text'][:80]
    cat = q['category']
    print(f'  - {text}... ({cat})')
