FROM nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10

RUN apk add --no-cache certbot certbot-nginx openssl && \
    mkdir -p /var/www/certbot && \
    echo "0 0 * * * certbot renew --quiet && nginx -s reload" > /etc/crontabs/root

COPY default.conf /etc/nginx/conf.d/default.conf
COPY entrypoint.sh /entrypoint.sh

EXPOSE 80 443

ENTRYPOINT ["/entrypoint.sh"]