import logging
import json
from collections import namedtuple

logger = logging.getLogger("WebUI")
User = namedtuple('User', ['username', 'password', 'permissions'])
user_map = {};
        
try:
    # read file
    with open('login.json', 'r') as loginFile:
        data = loginFile.read()

    # parse file
    obj = json.loads(data)
    for account in obj['accounts']:
        permissions = tuple(account["permissions"].split(","))
        user_map[account["name"]] = User(account["name"], account["password"], permissions)
except Exception as e:
    logger.error("users.py: {}".format(e))
    