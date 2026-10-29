FROM nginx:1.31-alpine@sha256:a3554c0d0b48177b1413c26e01f695334428020d9df01243fbae3e11cfd17417

RUN apk add --no-cache certbot certbot-nginx openssl && \
    mkdir -p /var/www/certbot && \
    echo "0 0 * * * certbot renew --quiet && nginx -s reload" > /etc/crontabs/root

COPY default.conf /etc/nginx/conf.d/default.conf
COPY entrypoint.sh /entrypoint.sh

EXPOSE 80 443

ENTRYPOINT ["/entrypoint.sh"]
