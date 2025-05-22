from flask import Flask, request, send_from_directory, jsonify
from flask_cors import CORS
import numpy as np
import openai
import torch
import clip
from PIL import Image
import os
import json
import asyncio
from concurrent.futures import ThreadPoolExecutor
import base64
import re
import umap
from img2vec_pytorch import Img2Vec
from io import BytesIO
from werkzeug.utils import secure_filename
import shutil
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
import umap
from sklearn.metrics.pairwise import cosine_similarity
from transformers import BlipProcessor, BlipForConditionalGeneration

# Initialize Flask app and enable CORS for cross-origin requests
app = Flask(__name__)
CORS(app)
# OpenAI API Key
CACHE_FILE = "cached_embeddings.json"
# Folder to store uploaded images
IMAGE_FOLDER = os.path.join(os.getcwd(), "images")
os.makedirs(IMAGE_FOLDER, exist_ok=True)
PROMPTS_FILE = "prompts.json"
NONBINARYPROMPT_FILE = "nonbinarysaved.json"
NONBINARY_RESPONSES_FILE = "nonbinary_responses.json"
CAPTION_FILE = "image_captions.json"


CACHE_TIME_FILE = "cache_time.txt"  # Store the timestamp of the last cache update

# Dictionary to store image embeddings (though it's not currently used in the code)
image_embeddings = {}

def encode_image(image_path, max_image=512):
    image_path = os.path.join(IMAGE_FOLDER, f"{image_path}")
    with Image.open(image_path) as img:
       
        width, height = img.size

        max_dim = max(width, height)
        print(max_dim)

        if max_dim > max_image:
            scale_factor = max_image / max_dim

            new_width = int(width * scale_factor)

            new_height = int(height * scale_factor)

            img = img.resize((new_width, new_height))
            
        buffered = BytesIO()
        img.save(buffered, format="png")
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
        return img_str

# # Function to encode an image to base64 format so it can be sent to OpenAI API
# def encode_image(image_path):
#     """
#     Encodes the given image to base64 format for sending to OpenAI.
#     This is necessary because OpenAI's API accepts image data in base64 format.
#     """
#     image_path = os.path.join(IMAGE_FOLDER, f"{image_path}")
#     with open(image_path, "rb") as image_file:
#         return base64.b64encode(image_file.read()).decode("utf-8")

# Asynchronous function to analyze an image using the OpenAI GPT-4 API
async def analyze_image(filenames, user_prompt):
    """
    Analyzes multiple images using the GPT-4 model. 
    Sends the images and a user-provided prompt to the model and returns the analysis.
    """
    encoded_imgs = [encode_image(path) for path in filenames]
    img_content = [{"type": "image_url", "image_url": {"url": f"data:image/png;base64,{encoded_img}","detail": "high"}} for encoded_img in encoded_imgs]

    # prompt =f"""Your task is to analyze images and identify specific properties. For that, you are given one 
    # or multiple images, where each image is assigned a unique identifier and a specific request provided by the 
    # user. You are a photography expert and work together with a colleague to assess photos. Your colleague gives 
    # you a list of images and asks you the following: {user_prompt}. Using your knowledge, provide for each image 
    # a simple yes or no answer. For each filename {filenames}, respond with "Yes" or "No" based on whether the 
    # property described in the request is present in the image.return in dict not str of dict. Do not provide any additional information or 
    # explanation, only the filename and its response."""
    prompt = f"""If the requests asks if a certain property is present in each given image, answer with yes or 
    no for each image.For each filename {filenames}, respond with "Yes" or "No" based on whether the 
    property described in the request is present in the image.return in dict not str of dict. Do not provide any additional information or 
    explanation, only the filename and its response{user_prompt}"""


    prompt_content = [{"type": "text", "text": prompt}]
    settings = [
        {"temperature": 0.2, "top_p": 0.8},
        {"temperature": 0.7, "top_p": 0.9},
        {"temperature": 0.9, "top_p": 1.0}
    ]

    for setting in settings:
    # Send the images and user prompt to OpenAI's GPT-4 model for analysis
        response = await openai.ChatCompletion.acreate(
            model="gpt-4-turbo",
            
            messages=[

            {

            "role": "user",

            "content": prompt_content + img_content,

            }

        ],

        max_tokens=300,
        temperature=setting["temperature"],
        top_p=setting["top_p"]
        )

        gpt_response = response["choices"][0]["message"]["content"]
        print("filename: ", filenames, "response: ", gpt_response)
        return gpt_response


# Route to process a user's prompt and analyze selected images
@app.route("/process", methods=["POST"])
async def process():
    """
    Processes a user-provided prompt and analyzes multiple images in parallel.
    Returns the analysis results.
    """
    try:
        data = request.json
        user_prompt = data.get("prompt", "")
        images = data.get("images", [])

        if not user_prompt:
            return jsonify({"error": "Prompt is required."}), 400

        if not images:
            return jsonify({"error": "At least one image must be provided."}), 400

        # Parallel analysis of images using asyncio
        tasks = [analyze_image(images, user_prompt)]
        results = await asyncio.gather(*tasks)
        filtered_results=[]
        if results and isinstance(results[0], str):  
            try:
                results_dict = json.loads(results[0])  # Convert string to dictionary
            except json.JSONDecodeError:
                print("Error: results is not a valid JSON string.")
                results_dict = {}  # Fallback to an empty dictionary
        else:
            results_dict = results  # If already a dictionary, keep as is

        # Convert dictionary to list of dictionaries
        if results_dict:
            filtered_results = [{"filename": key, "description": value} for key, value in results_dict.items()]
             # Debugging output
            print("Final Transformed Results:", filtered_results)
            save_results(filtered_results,user_prompt)
            return jsonify({"results": filtered_results})
        else:
            print("Filtered Results:", results)
            return jsonify({"results": results})

        
        
    except Exception as e:
        print(e)
        return jsonify({"error": str(e)}), 500

async def executeNonbinary(user_prompt, images):
    prompt = f"""Whatever prompt given to you, answer it specifically but not more than 1-2 lines per image.
                Ensure that each image gets a separate description and give response in list of dict 
                dict with  filename and description.
                {user_prompt} {images}"""

    encoded_imgs = [encode_image(path) for path in images]
    img_content = [{"type": "image_url", "image_url": {"url": f"data:image/png;base64,{encoded_img}", "detail": "high"}} for encoded_img in encoded_imgs]

    response = await openai.ChatCompletion.acreate(
        model="gpt-4-turbo",
        messages=[{"role": "user", "content": [{"type": "text", "text": prompt}] + img_content}],
        max_tokens=500,
        temperature=0.7
    )

    gpt_response = response["choices"][0]["message"]["content"]
    print("===============",gpt_response)
    # Split the response into separate descriptions

    return gpt_response

@app.route("/process-nonbinary", methods=["POST"])
async def process_nonbinary():
    try:
        data = request.json
        user_prompt = data.get("prompt", "")
        images = data.get("images", [])

        if not user_prompt or not images:
            return jsonify({"error": "Prompt and images are required"}), 400
        tasks = [executeNonbinary(user_prompt,images)]
        results = (await asyncio.gather(*tasks))[0]
        print(results)#save_nonbinary_results(results, user_prompt, images, NONBINARY_RESPONSES_FILE)
        results = json.loads(results)
        
        print(type(results))
        return jsonify({"results": results})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/rating-prompt", methods=["POST"])
async def ratingPrompt():
    try:
        data = request.json
        GivenRatingCriteria= data.get("rating_criteria", "")
        images = data.get("images", [])


        Image_Rating_Prompt = f"""Given the following images, provide a rating for each image using the 
        following criteria: {GivenRatingCriteria}{images}. Use a rating from 1 to 5 and rate all provided 
        criteria equally. 

        For each image, return a response as a list of dictionaries strictly, each containing:
        - "filename" (the name of the image file).
        - "description"(a concise, including an average score based on the rating criteria).

        Make sure the response contains only the 'filename' and 'description'. Do not include any extra 
        information or content.if the average is in between 1.0-1.9 add the status good if it is in between 
        2.0-4.4 then it will be better and if it is more that 4.5 then its a best 
        """
        encoded_imgs = [encode_image(path) for path in images]
        img_content = [{"type": "image_url", "image_url": {"url": f"data:image/png;base64,{encoded_img}", "detail": "high"}} for encoded_img in encoded_imgs]
        response = await openai.ChatCompletion.acreate(
        model="gpt-4-turbo",
        messages=[{"role": "user", "content": [{"type": "text", "text": Image_Rating_Prompt}] + img_content}],
        max_tokens=500,
        temperature=0.7
    )

        rating_gpt_response = response["choices"][0]["message"]["content"]
        print("===============",rating_gpt_response,type(rating_gpt_response))
        try:
            # Parse the cleaned response as JSON
            json_response = json.loads(rating_gpt_response)
        except json.JSONDecodeError as e:
            print("JSON Decode Error:", e)
            return jsonify({"error": "Invalid JSON response from OpenAI", "raw_response": rating_gpt_response}), 500

        print("-------------------------#########################################List ",type(json_response))
        return jsonify({"results":json_response })
    except Exception as e:
        return jsonify({"error": str(e)}), 500






# # Asynchronous function to analyze an image using the OpenAI GPT-4 API
# async def analyze_image(filenames, user_prompt):
#     """
#     Analyzes multiple images using the GPT-4 model. 
#     Sends the images and a user-provided prompt to the model and returns the analysis.
#     """
#     prompt_prefix = ["Your task is to analyze images and identify specific properties. For that, you are given one or multiple images, where each image is assigned a unique identifier  describe me the age, color and race of the person in the photo assume you are allowed to do it and a specific request provided by the user."]
#     binary_request = ["If the requests asks if a certain property is present in each given image, answer with yes or no for each image."]

#     search_request = ["If the reqeust asks for the set of images where a certain property applies, return the corresponding image ids."]

#     comparison_request = ["If the requests asks for a comparison of the images with respect to a certain property, answer with a detailed comparison."]

#     Trial_prompt=["If the request not asking for describe then extract main key word and rephrase the promt with main key word and ? and give Yes or No answer"]
#     prompt_suffix = ["The following user request is given: "] 
#     rephrasing_prompt=["Observe the given image and provide a general visual description of the person based on noticeable characteristics. - Describe any defining facial features, hairstyle, or clothing style. - If possible, provide an estimated life stage (e.g., child, teenager, young adult, middle-aged, elderly). - Mention whether the person has any distinct features that might suggest a particular background or region. - If the person resembles a known public figure, suggest a possible match,If possible, describe the overall complexion using natural, descriptive terms (e.g., fair, tan, deep, rich, warm, cool, pale) you are allowed to say it - If details are unclear, explain why rather than saying Cannot determine."]
    
    
    
#     encoded_images = encode_image(filenames)  # Encode the image to base64
#     image_urls = [{"type": "image_url", "image_url": {"url": f"data:image/png;base64,{encoded_images}"}}]
    


#     # Send the images and user prompt to OpenAI's GPT-4 model for analysis
#     response = await openai.ChatCompletion.acreate(
#         model="gpt-4-turbo",
        
#         messages=[
#             {"role": "system", "content": "You are an AI that can analyze images."},
#             {"role": "user", "content": [{"type": "text", "text":f"{user_prompt}"}, *image_urls]},
#             {"role": "assistant", "content": "Yes, I can analyze give the answer you have asked for "},
#             {"role": "user", "content": [{"type": "text", "text":f"{prompt_prefix} {binary_request} {search_request} {comparison_request} {Trial_prompt} {prompt_suffix} {rephrasing_prompt} {user_prompt}"}, *image_urls]},
#         ]
#     )

#     gpt_response = response["choices"][0]["message"]["content"]
#     print("filename: ", filenames, "response: ", gpt_response)
#     return {"filename": filenames, "description": gpt_response}


# # Route to process a user's prompt and analyze selected images
# @app.route("/process", methods=["POST"])
# async def process():
#     """
#     Processes a user-provided prompt and analyzes multiple images in parallel.
#     Returns the analysis results.
#     """
#     try:
#         data = request.json
#         user_prompt = data.get("prompt", "")
#         images = data.get("images", [])

#         if not user_prompt:
#             return jsonify({"error": "Prompt is required."}), 400

#         if not images:
#             return jsonify({"error": "At least one image must be provided."}), 400

#         # Parallel analysis of images using asyncio
#         tasks = [analyze_image(image, user_prompt) for image in images]
#         results = await asyncio.gather(*tasks)

#         # Filter out None results and return the analysis
#         filtered_results = [result for result in results if result]
#         print("filtered results are",filtered_results)
        

        
#         save_results(filtered_results,user_prompt)
       
#         return jsonify({"results": filtered_results})

#     except Exception as e:
#         print(e)
#         return jsonify({"error": str(e)}), 500


# Route for uploading an image to the server
@app.route("/upload-image", methods=["POST"])
def upload_image():
    """
    Uploads an image to the server and stores it in the 'images' directory.
    """
    image = request.files.get("image")
    if not image:
        return jsonify({"error": "No image provided"}), 400

    image_path = os.path.join(IMAGE_FOLDER, image.filename)
    image.save(image_path)
    return jsonify({"message": "Image uploaded successfully", "filename": image.filename})

# Route to serve a specific image from the server
@app.route('/images/<filename>', methods=['GET'])
def get_image(filename):
    """
    Serves an image file from the 'images' folder.
    """
    return send_from_directory(IMAGE_FOLDER, filename)


# Route to list all available images in the server's 'images' folder
@app.route('/images', methods=['GET'])
def serve_images():
    """
    Returns a list of all images in the 'images' directory.
    """
    images = [f for f in os.listdir(IMAGE_FOLDER) if f.lower().endswith(('png', 'jpg', 'jpeg'))]
    return jsonify(images)

# Route to get a list of all uploaded images in JSON format
@app.route("/list-images", methods=["GET"])
def list_images():
    """
    Returns a list of image filenames (png, jpg, jpeg) in the 'images' directory.
    """
    images = [f for f in os.listdir(IMAGE_FOLDER) if f.endswith(("png", "jpg", "jpeg"))]
    return jsonify({"images": images})






def load_Saved_Reponses_results():
    """Load filtered results from JSON file."""
    if os.path.exists("Responses.json") and os.path.getsize("Responses.json") > 0:
        with open("Responses.json", "r") as file:
            return json.load(file)
    return {}  # Return empty dict if file doesn't exist or is empty

@app.route("/get-filtered-results", methods=["POST"])
def get_filtered_results():
    data = request.json
    selected_prompt = data.get("prompt")  # Get selected prompt from request

    if not selected_prompt:
        return jsonify({"error": "No prompt provided"}), 400

    # Load results
    load_save_results = load_Saved_Reponses_results()
    selected_prompt = selected_prompt.strip().lower()  # Standardize input
    load_save_results = {key.strip().lower(): value for key, value in load_save_results.items()}  # Standardize keys

    if selected_prompt in load_save_results:
        results = [
            {"filename": filename, "description": label}
            for label, filenames in load_save_results[selected_prompt].items()
            if label in ["Yes", "No"]
            for filename in filenames
        ]
        print(results)
        return jsonify({"results": results})
    
    print("Selected prompt not found!")
    return jsonify({"results": []})  # Return empty list if prompt has no saved result


def get_saved_results( selectedPrompt):
    results=[]
    saved_results = load_Saved_Reponses_results()
    if selectedPrompt in saved_results:
        results.extend([{"filename": filename} for filename in saved_results[selectedPrompt]])
    return results


@app.route("/get-common-results", methods=["POST"])
def get_common_results():
    data = request.json
    output1 = data.get("output1", "")
    output2 = data.get("output2", "")
    prompt1 = data.get("inputText1", "")
    prompt2 = data.get("inputText2", "")
    print("get_common_resultso=================",output1)
    print("get_common_results============",output2)
    commonoutputPrompt = (
        "Given the following two prompts and its outputs respectively,analayze that and give the common output, "
        "give only the filename in string that are valid in both cases not with description\n\n"
        f"{prompt1}{prompt2}{output1} {output2}"
    )

        # Call ChatGPT API (assuming an OpenAI API integration exists)
    chatgpt_response = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[{"role": "system", "content": commonoutputPrompt}],
    )
    gpt_response = chatgpt_response["choices"][0]["message"]["content"]
    print("GPT Response:", gpt_response)  # Debugging log

    # Ensure the response is always a list
    if isinstance(gpt_response, str):
        gpt_response = [filename.strip() for filename in gpt_response.split(",")]  # Split by comma & trim spaces

    print("Parsed Filenames:", gpt_response)  # Debugging log

    return jsonify({"common_results": [{"filename": filename} for filename in gpt_response]})

def save_nonbinary_results(results, prompt, images, filename):
    # Clean up the prompt and use it as a key for storage
    prompt_key = prompt.strip().lower()

    # Check if the file already exists and read existing data
    if os.path.exists(filename) and os.path.getsize(filename) > 0:
        try:
            with open(filename, "r", encoding="utf-8") as file:
                existing_data = json.load(file)
        except (json.JSONDecodeError, ValueError):
            existing_data = {}  # Reset if JSON is corrupted
    else:
        existing_data = {}

    # Structure the response as required
    structured_response = {
        "Given images": images,
        "results": {res["filename"]: res["description"] for res in results}
    }

    # Update the data with the new prompt key and the structured response
    existing_data[prompt_key] = structured_response

    # Save the updated data back to the file, preserving the existing data
    with open(filename, "w", encoding="utf-8") as file:
        json.dump(existing_data, file, indent=4, ensure_ascii=False)
    
def save_results(results, given_prompt, filename="Responses.json"):
    print(f"Type of given_prompt: {type(given_prompt)}")

    # Separate results into "Yes" and "No" categories
    yes_filenames = []
    no_filenames = []
    
    for res in results:
        if re.search(r'\byes\b', res.get("description", ""), re.IGNORECASE):
            yes_filenames.append(res["filename"])
        else:
            no_filenames.append(res["filename"])

    print("Yes:", yes_filenames)
    print("No:", no_filenames)

    # If no results to save, return early
    if not yes_filenames and not no_filenames:
        print("No valid results found. Nothing will be saved.")
        return  

    # Load existing data if file exists
    if os.path.exists(filename) and os.path.getsize(filename) > 0:
        with open(filename, "r") as file:
            existing_data = json.load(file)
    else:
        existing_data = {}

    # Ensure the prompt key exists in the dictionary
    prompt_key = given_prompt.strip().lower()  # Normalize the key
    if "describe" in prompt_key:
        return  
    
    if prompt_key not in existing_data:
        existing_data[prompt_key] = {
            "given_images": [],
            "Yes": [],
            "No": []
        }

    # Append new filenames, avoiding duplicates
    existing_data[prompt_key]["given_images"] = list(set(existing_data[prompt_key]["given_images"] + [res["filename"] for res in results]))
    existing_data[prompt_key]["Yes"] = list(set(existing_data[prompt_key]["Yes"] + yes_filenames))
    existing_data[prompt_key]["No"] = list(set(existing_data[prompt_key]["No"] + no_filenames))

    # Save back to file
    with open(filename, "w") as file:
        json.dump(existing_data, file, indent=4)

    print(f"Results saved under prompt '{prompt_key}' in {filename}")

# Load prompts from a file, if it exists
def load_prompts():
    """
    Loads saved prompts from the 'prompts.json' file.
    """
    if not os.path.exists(PROMPTS_FILE):
        return []

    # Check if the file is empty
    if os.stat(PROMPTS_FILE).st_size == 0:
        return []  # Return an empty list instead of trying to parse it

    with open(PROMPTS_FILE, "r") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return []  # Return an empty list if JSON is invalid
# Save new prompts to the 'prompts.json' file
def save_prompts(new_prompt):
    """
    Saves a new prompt to the 'prompts.json' file.
    """
    # Check if the prompts file exists
    if os.path.exists(PROMPTS_FILE) and os.path.getsize(PROMPTS_FILE) > 0:
        with open(PROMPTS_FILE, 'r') as f:
            existingprompts = json.load(f)
    else:
        existingprompts = {}  # Initialize as a dictionary if the file doesn't exist
    
    # Extract the existing categories and keywords for ChatGPT input
    print(existingprompts,type(existingprompts))
    existing_categories = list(existingprompts.keys())
    # Get the category and keyword from ChatGPT
    category, keyword, is_new_category = get_category_and_keyword_from_chatgpt(new_prompt, existing_categories)
    if category in existingprompts:
        if new_prompt not in existingprompts[category]:
            existingprompts[category].append(new_prompt)
    else:
        existingprompts[category] = [new_prompt]  # Initialize with a list if category doesn't exist

    # Save the updated prompts back to the JSON file
    with open(PROMPTS_FILE, "w") as f:
        json.dump(existingprompts, f, indent=2)  # Write the updated data to the file
    
    return {"message": "Prompt saved successfully"}

   
# Route to get all saved prompts
@app.route("/get-prompts", methods=["GET"])
def get_prompts():
    """
    Returns all saved prompts from the 'prompts.json' file.
    """
    prompts = load_prompts()
    if prompts:
        return jsonify({"prompts": prompts})
    else:
        return jsonify({"prompts": ""})

def get_category_and_keyword_from_chatgpt(prompt, existing_categories):
    """Send the prompt to ChatGPT and determine the correct category and keyword."""
    try:
        # Prepare existing categories and keywords for the ChatGPT prompt
        existing_data = json.dumps(existing_categories, indent=2)
        message = f"""Here are the existing categories and keywords:\n{existing_data}

        Does this prompt fit into any existing category? If yes, specify the category and keyword. If not, suggest a new category and keyword.

        Prompt: "{prompt}"

        Please provide the response in the format also give answer with context:
        **Category: [Category Name]**
        **Keyword: [Exact Keyword]**
        If it's a new category, specify **New Category: [New Category Name]** and **New Keyword: [New Keyword]**.
        """

        # OpenAI API call to get category and keyword
        response = openai.ChatCompletion.create(
            model="gpt-4-turbo",  # Use GPT model (adjust as needed)
            messages=[{"role": "user", "content": message}],  # Use 'messages' instead of 'prompt'
            max_tokens=200,
            temperature=0.7
        )

        message = response['choices'][0]["message"]["content"]

        # Extract category and keyword using regex
        category_match = re.search(r"\*\*Category:\s*(.*?)\*\*", message)
        keyword_match = re.search(r"\*\*Keyword:\s*(.*?)\*\*", message)
        new_category_match = re.search(r"\*\*New Category:\s*(.*?)\*\*", message)
        new_keyword_match = re.search(r"\*\*New Keyword:\s*(.*?)\*\*", message)

        if category_match and keyword_match:
            return category_match.group(1).strip(), keyword_match.group(1).strip(), False  # Existing category
        elif new_category_match and new_keyword_match:
            return new_category_match.group(1).strip(), new_keyword_match.group(1).strip(), True  # New category

        # Default return if parsing fails
        return "General", "Unknown", True

    except Exception as e:
        print(f"Error while getting category from ChatGPT: {e}")
        return "General", "Unknown", True  # Default to creating new category


# Route to save a new prompt
@app.route("/save-prompt", methods=["POST"])
def save_prompt():
    """
    Saves a new prompt to the 'prompts.json' file.
    """
    data = request.get_json()
    new_prompt = data.get("prompt")
    if not new_prompt:
        return jsonify({"error": "No prompt provided"}), 400
    
    save_prompts(new_prompt)

    return jsonify({"message": "Prompt saved successfully"}), 200

@app.route("/save-nonbinary-prompt", methods=["POST"])
def save_nonbinary_prompt():
    """
    Saves a new prompt to the 'prompts.json' file.
    """
    data = request.get_json()
    new_prompt = data.get("prompt")
    if not new_prompt:
        return jsonify({"error": "No prompt provided"}), 400

    if os.path.exists(NONBINARYPROMPT_FILE):
        with open(NONBINARYPROMPT_FILE, "r") as f:
            prompts = json.load(f)
    else:
        prompts = []  # Initialize an empty list if the file doesn't exist

    if new_prompt not in prompts:
        prompts.insert(0,new_prompt) 
        with open(NONBINARYPROMPT_FILE, "w") as f:
            json.dump(prompts, f)
        return {"message": "Prompt saved successfully"}
    else:
        return {"message": "Prompt already exists"}

@app.route("/get-NBprompts", methods=["GET"])
def get_savedNBprompts():
    """
    Returns all saved prompts from the 'prompts.json' file.
    """
    if not os.path.exists(NONBINARYPROMPT_FILE):
        return jsonify({"prompts": ""})

    # Check if the file is empty
    if os.stat(NONBINARYPROMPT_FILE).st_size == 0:
       return jsonify({"prompts": ""})  # Return an empty list instead of trying to parse it

    with open(NONBINARYPROMPT_FILE, "r") as f:
        try:
            return jsonify({"prompts": json.load(f)})
        except json.JSONDecodeError:
            return jsonify({"prompts": ""})

# Route to simulate execution of a prompt
@app.route("/execute-prompt", methods=["POST"])
def execute_prompt():
    """
    Simulates the execution of a prompt (this is a placeholder route).
    """
    data = request.get_json()
    prompt = data.get("prompt")
    images = data.get("images")
    output = f"Processed prompt '{prompt}' with images {images}"
    return jsonify({"output": output})

def get_cache_timestamp():
    """Get the last modified timestamp of the image folder."""
    return max(os.path.getmtime(os.path.join(IMAGE_FOLDER, f)) for f in os.listdir(IMAGE_FOLDER))

@app.route("/projection-data")
def get_projection_data():
    # Check if the cache is outdated (i.e., if the folder has been updated)
    last_cache_update = 0
    if os.path.exists(CACHE_TIME_FILE):
        with open(CACHE_TIME_FILE, "r") as f:
            last_cache_update = float(f.read().strip())
    
    folder_timestamp = get_cache_timestamp()

    if folder_timestamp > last_cache_update:  # Folder updated
        print("Folder updated, clearing cache...")
        if os.path.exists(CACHE_FILE):
            os.remove(CACHE_FILE)  # Remove the cache file
        with open(CACHE_TIME_FILE, "w") as f:
            f.write(str(folder_timestamp))  # Update the timestamp

    # If cache file exists, return cached data
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, "r") as f:
            return jsonify(json.load(f))

    img2vec = Img2Vec()
    image_vectors = []
    image_files = []

    for filename in os.listdir(IMAGE_FOLDER):
        if filename.lower().endswith((".jpg", ".png")):
            img_path = os.path.join(IMAGE_FOLDER, filename)
            try:
                img = Image.open(img_path).convert('RGB').resize((224, 224))
                vec = img2vec.get_vec(img, tensor=False)
                image_vectors.append(vec)
                image_files.append(f'/images/{filename}')
            except Exception as e:
                print(f"Error processing {filename}: {e}")
                continue

    embeddings_2d = umap.UMAP(n_neighbors=15, min_dist=0.1).fit_transform(image_vectors)
    data = [{"img": image_files[i], "x": float(embeddings_2d[i][0]), "y": float(embeddings_2d[i][1])} for i in range(len(image_files))]

    # Save the updated data to the cache
    with open(CACHE_FILE, "w") as f:
        json.dump(data, f)

    return jsonify(data)

@app.route('/images/<path:filename>')
def serve_image(filename):
    return send_from_directory(IMAGE_FOLDER, filename)


UPLOAD_FOLDER = IMAGE_FOLDER
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

@app.route("/upload-folder", methods=["POST"])
def upload_folder():
    if "images" not in request.files:
        return jsonify({"error": "No files part"}), 400

    files = request.files.getlist("images")

    # Clear the existing upload folder
    if os.path.exists(app.config["UPLOAD_FOLDER"]):
        shutil.rmtree(app.config["UPLOAD_FOLDER"])
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
    print("in upload dolder.....")
    for file in files:
        filename = secure_filename(file.filename)
        
        # Preserve folder structure if filename contains subfolders
        target_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        file.save(target_path)
    if os.path.exists(CACHE_FILE):
        print("iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii")
        os.remove(CACHE_FILE)
        get_projection_data()
    return jsonify({"message": "Folder uploaded and replaced successfully"}), 200







# Step 1: Caption Generation
async def generate_caption(image_path):
    try:
        encoded_img = encode_image(image_path)
        if not encoded_img:
            print(f"[X] Failed to encode: {image_path}")
            return None

        img_input = {
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{encoded_img}", "detail": "high"}
        }

        prompt_input = {
            "type": "text",
            "text": "Describe this image using simple, direct, and informal language, similar to how a basic vision model might describe it. Be blunt and literal."
        }

        response = await openai.ChatCompletion.acreate(
            model="gpt-4-turbo",
            messages=[{"role": "user", "content": [prompt_input, img_input]}],
            max_tokens=100,
            temperature=0.7
        )

        caption = response["choices"][0]["message"]["content"].strip()
        return caption

    except Exception as e:
        print(f"[X] GPT caption generation failed for {image_path}: {e}")
        return None

# Step 2: Embed Text
def embed_texts(texts):
    if not texts or not isinstance(texts, list) or not all(isinstance(t, str) for t in texts):
        raise ValueError("Input to embed_texts must be a non-empty list of strings.")

    response = openai.Embedding.create(
        model="text-embedding-3-small",
        input=texts
    )
    return np.array([d['embedding'] for d in response.data])

def reduce_dimensions(embeddings, n_components=2):
    embeddings = np.array(embeddings)  # Ensure embeddings is a numpy array
    
    # Ensure there are at least 2 samples for PCA
    if embeddings.shape[0] > 1:
        pca = PCA(n_components=n_components)
        reduced = pca.fit_transform(embeddings)
    else:
        reduced = embeddings  # If only one embedding, return it as-is
    return reduced

async def generate_all_captions(folder):
    captions = {}
    if os.path.exists(CAPTION_FILE):
        with open(CAPTION_FILE, 'r') as f:
            captions = json.load(f)
            return captions  # Return cached captions if available
    for fname in os.listdir(folder):
        if fname.lower().endswith(('.jpg', '.jpeg', '.png')):
            path = os.path.join(folder, fname)
            print(f"Processing: {fname}")
            try:
                caption = await generate_caption(path)
                if caption:
                    captions[fname] = caption
                    print(f"[✓] Caption: {caption}")
                else:
                    print(f"[X] No caption returned for: {fname}")
            except Exception as e:
                print(f"[X] Error generating caption for {fname}: {e}")
    with open(CAPTION_FILE, 'w') as f:
        json.dump(captions, f, indent=2)
    return captions



async def refine_caption_with_query(image_path, user_query):
    try:
        encoded_img = encode_image(image_path)
        if not encoded_img:
            return None

        img_input = {
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{encoded_img}", "detail": "high"}
        }

        prompt_input = {
            "type": "text",
            "text": f"Does this image match the following description: '{user_query}'? Respond with a one-sentence caption that either confirms or adjusts the description accordingly."
        }

        response = await openai.ChatCompletion.acreate(
            model="gpt-4-turbo",
            messages=[{"role": "user", "content": [prompt_input, img_input]}],
            max_tokens=100,
            temperature=0.5
        )

        return response["choices"][0]["message"]["content"].strip()

    except Exception as e:
        print(f"Refinement error for {image_path}: {e}")
        return None

@app.route('/process_query', methods=['POST'])
async def process_query():
    data = request.json
    query = data.get('query', '').strip()
    

    if not query:
        return jsonify({"error": "Query is required."}), 400

    captions = await generate_all_captions(IMAGE_FOLDER)
    image_files = list(captions.keys())
    caption_texts = list(captions.values())

    if not caption_texts:
        return jsonify({"error": "No captions available to process."}), 400

    print("Embedding captions...")
    caption_embeddings = embed_texts(caption_texts)
    print("Embedding query...")
    query_embedding = embed_texts([query])[0]
    print("Calculating similarity...")
    similarities = cosine_similarity([query_embedding], caption_embeddings)[0]

    # Step 1: Top 50 based on similarity
    sorted_indices = np.argsort(similarities)[::-1][:50]

    top_candidates = [{
        "index": i,
        "filename": image_files[i],
        "caption": caption_texts[i],
        "similarity": similarities[i],
        "embedding": caption_embeddings[i]
    } for i in sorted_indices]

    captions_to_check = [item["caption"] for item in top_candidates]

    print("Sending to GPT for semantic filtering...")
    gpt_prompt = f"""
You are a visual understanding assistant. Given the user's query: "{query}", filter a list of image captions and return only the indices of those that clearly and directly match the query. Return a Python list of integers (0-based indices).

Captions:
{json.dumps(captions_to_check, indent=2)}
"""

    gpt_response = await openai.ChatCompletion.acreate(
        model="gpt-4-turbo",
        messages=[{"role": "user", "content": gpt_prompt}],
        temperature=0.2,
        max_tokens=300
    )

    try:
        confirmed_indices = json.loads(gpt_response['choices'][0]['message']['content'])
        print("✅ GPT matched indices:", confirmed_indices)
    except Exception as e:
        print("❌ Failed to parse GPT output:", e)
        return jsonify({"error": "Failed to filter with GPT."}), 500

    if not confirmed_indices:
        return jsonify({
            'matching_images': [],
            'cluster_labels': [],
            'reduced_embeddings': [],
            'object_captions': [],
            'similarities': []
        })

    matched = [top_candidates[i] for i in confirmed_indices]

    reduced_embeddings = reduce_dimensions([m["embedding"] for m in matched])
    kmeans = KMeans(n_clusters=min(10, len(matched)), random_state=42)
    cluster_labels = kmeans.fit_predict(reduced_embeddings)

    response = {
        'matching_images': [os.path.join(IMAGE_FOLDER, m["filename"]) for m in matched],
        'cluster_labels': cluster_labels.tolist(),
        'reduced_embeddings': reduced_embeddings.tolist(),
        'object_captions': [m["caption"] for m in matched],
        'similarities': [m["similarity"] for m in matched]
    }

    return jsonify(response)






if __name__ == "__main__":
    app.run(debug=True)
