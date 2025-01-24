from flask import Flask, request,send_from_directory, jsonify
from flask_cors import CORS
import openai
import torch
import clip
from PIL import Image
import os
import json
import asyncio
from concurrent.futures import ThreadPoolExecutor
import base64


app = Flask(__name__)
CORS(app)

openai.api_key = "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"  # Don't forget to replace with your actual API key.

IMAGE_FOLDER = os.path.join(os.getcwd(), "images")
os.makedirs(IMAGE_FOLDER, exist_ok=True)
image_embeddings = {}

def encode_image(image_path):
    image_path = os.path.join(IMAGE_FOLDER, f"{image_path}")
    print(image_path)
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")
        


async def analyze_image(filename, user_prompt):
    """
    Analyze a single image using CLIP and GPT-4.
    """
    print("Hellllloooooo")
    try:
        
        image_path = os.path.join(IMAGE_FOLDER, f"{filename}")
        print(image_path)
        encoded_images=encode_image(filename)
        print(filename)
        response = openai.ChatCompletion.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are a helpful assistant that responds in plain text. Help me with my math homework!"},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": f"{user_prompt}",
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{encoded_images}",
                        },
                    }
                ],
            }
        ],
    )

        gpt_response = response["choices"][0]["message"]["content"]
        return {"filename": filename, "description": gpt_response}

    except Exception as e:
        print(e)
        return {"filename": filename, "error": str(e)}


# Upload and list images
@app.route("/upload-image", methods=["POST"])
def upload_image():
    image = request.files.get("image")
    if not image:
        return jsonify({"error": "No image provided"}), 400

    image_path = os.path.join(IMAGE_FOLDER, image.filename)
    image.save(image_path)
    return jsonify({"message": "Image uploaded successfully", "filename": image.filename})

@app.route('/images/<filename>', methods=['GET'])
def get_image(filename):
    return send_from_directory(IMAGE_FOLDER, filename)



@app.route('/images', methods=['GET'])
def serve_images():
    images = [f for f in os.listdir(IMAGE_FOLDER) if f.lower().endswith(('png', 'jpg', 'jpeg'))]
    return jsonify(images)

@app.route("/list-images", methods=["GET"])
def list_images():
    images = [f for f in os.listdir(IMAGE_FOLDER) if f.endswith(("png", "jpg", "jpeg"))]
    return jsonify({"images": images})

# Send prompt and selected images to GPT model
@app.route("/process", methods=["POST"])
async def process():
    """
    Handle user prompt and analyze multiple images in parallel.
    """
    try:
        data = request.json
        user_prompt = data.get("prompt", "")
        images = data.get("images", [])

        if not user_prompt:
            return jsonify({"error": "Prompt is required."}), 400

        if not images:
            return jsonify({"error": "At least one image must be provided."}), 400


        # Parallel analysis of images
        tasks = [analyze_image(image, user_prompt) for image in images]
        results = await asyncio.gather(*tasks)

        # Filter out None results and return
        filtered_results = [result for result in results if result]
        return jsonify({"results": filtered_results})

    except Exception as e:
        print(e)
        return jsonify({"error": str(e)}), 500
    
    
PROMPTS_FILE = "prompts.json"

# Load prompts from the file
def load_prompts():
    if not os.path.exists(PROMPTS_FILE):
        return []
    with open(PROMPTS_FILE, "r") as f:
        return json.load(f)

# Save prompts to the file
def save_prompts(new_prompt):
    """
    Appends a new prompt to the existing prompts in the file.
    """
    # Load existing prompts from the file
    if os.path.exists(PROMPTS_FILE):
        with open(PROMPTS_FILE, "r") as f:
            prompts = json.load(f)
    else:
        prompts = []  # Initialize an empty list if the file doesn't exist

    # Append the new prompt if it's not already in the list
    if new_prompt not in prompts:
        prompts.append(new_prompt)

        # Save the updated list of prompts back to the file
        with open(PROMPTS_FILE, "w") as f:
            json.dump(prompts, f)

        return {"message": "Prompt saved successfully"}
    else:
        return {"message": "Prompt already exists"}

@app.route("/get-prompts", methods=["GET"])
def get_prompts():
    prompts = load_prompts()
    return jsonify({"prompts": prompts})

@app.route("/save-prompt", methods=["POST"])
def save_prompt():
    data = request.get_json()
    new_prompt = data.get("prompt")
    print(new_prompt)
    if not new_prompt:
        return jsonify({"error": "No prompt provided"}), 400

    #prompts = load_prompts()
    prompts=[]
    if new_prompt not in prompts:
        prompts.append(new_prompt)
        save_prompts(prompts)

    return jsonify({"message": "Prompt saved successfully"})

@app.route("/execute-prompt", methods=["POST"])
def execute_prompt():
    data = request.get_json()
    prompt = data.get("prompt")
    images = data.get("images")

    # Simulate GPT model processing
    output = f"Processed prompt '{prompt}' with images {images}"

    return jsonify({"output": output})

if __name__ == "__main__":
    app.run(debug=True)

