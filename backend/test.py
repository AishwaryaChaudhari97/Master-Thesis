import openai

# Set your OpenAI API key
openai.api_key = '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'

# List all models
models = openai.Model.list()

# Print available models
for model in models['data']:
    print(f"Model ID: {model['id']}, Created: {model['created']}, Type: {model['object']}")
