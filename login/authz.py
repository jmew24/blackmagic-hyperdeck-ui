from aiohttp_security.abc import AbstractAuthorizationPolicy


class DictionaryAuthorizationPolicy(AbstractAuthorizationPolicy):
    def __init__(self, user_map):
        super().__init__()
        self.user_map = user_map

    async def authorized_userid(self, identity):
        if identity in self.user_map:
            return identity

    async def permits(self, identity, permission, context=None):
        user = self.user_map.get(identity)
        if not user:
            return False
        return permission in user.permissions

async def check_credentials(user_map, username, password):    
    # If we have no accounts, auto validate all requests
    if len(user_map) <= 0:
        return True
        
    user = user_map.get(username)
    if not user:
        return False

    return user.password == password